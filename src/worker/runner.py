from __future__ import annotations

import threading
import time
from collections.abc import Callable
from contextlib import suppress
from dataclasses import dataclass

from src.pipeline import run_youtube_source
from src.web_adapter import PipelineObserver
from src.worker.client import ControlPlaneClient, ControlPlaneError, LeaseClaim
from src.worker.finalize import JobFinalizer
from src.worker.heartbeat import LeaseHeartbeat
from src.worker.outbox import OutboxPublisher, OutboxPublishError, SpoolingObserver
from src.worker.spool import WorkerSpool

PipelineRunner = Callable[..., object]


@dataclass(frozen=True, slots=True)
class RunOutcome:
    claimed: bool
    job_id: str | None = None
    completed: bool = False
    reason: str | None = None


class WorkerRunner:
    def __init__(
        self,
        *,
        client: ControlPlaneClient,
        spool: WorkerSpool,
        worker_id: str,
        lease_seconds: int = 120,
        heartbeat_interval_seconds: float | None = None,
        pipeline: PipelineRunner = run_youtube_source,
        finalizer: JobFinalizer | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if lease_seconds < 15 or lease_seconds > 300:
            raise ValueError("lease_seconds must be between 15 and 300.")
        self.client = client
        self.spool = spool
        self.worker_id = worker_id
        self.lease_seconds = lease_seconds
        self.heartbeat_interval_seconds = heartbeat_interval_seconds or min(30, lease_seconds / 3)
        self.pipeline = pipeline
        self.finalizer = finalizer
        self.sleep = sleep
        self._stop = threading.Event()

    def request_stop(self) -> None:
        self._stop.set()

    def run_forever(self, poll_seconds: float = 5) -> None:
        while not self._stop.is_set():
            self.run_once()
            self._stop.wait(max(0.1, poll_seconds))

    def run_once(self) -> RunOutcome:
        if self._stop.is_set():
            return RunOutcome(claimed=False, reason="STOP_REQUESTED")
        claim = self._claim_with_retry()
        if claim is None:
            return RunOutcome(claimed=False, reason="NO_JOB")
        return self._run_claim(claim)

    def _run_claim(self, claim: LeaseClaim) -> RunOutcome:
        publisher = OutboxPublisher(
            client=self.client,
            spool=self.spool,
            job_id=claim.job_id,
            worker_id=self.worker_id,
            lease_token=claim.lease_token,
            sleep=self.sleep,
        )
        heartbeat = LeaseHeartbeat(
            client=self.client,
            job_id=claim.job_id,
            worker_id=self.worker_id,
            lease_token=claim.lease_token,
            lease_seconds=self.lease_seconds,
            interval_seconds=self.heartbeat_interval_seconds,
        )
        heartbeat.start()
        try:
            if claim.work_kind == "FINALIZE":
                return self._run_finalization(claim, heartbeat)

            try:
                publisher.flush()
            except OutboxPublishError:
                return RunOutcome(True, claim.job_id, reason="OUTBOX_UNAVAILABLE")

            if not self.spool.pipeline_complete(claim.job_id):
                observer: PipelineObserver = SpoolingObserver(claim.job_id, self.spool, publisher)
                # Per-video failures are already sanitized and spooled. A global
                # extraction failure is represented by complete() with zero results.
                with suppress(Exception):
                    self.pipeline(
                        claim.source_url,
                        ask_each=False,
                        keep_all=True,
                        export_graphipy=False,
                        delete_cache=False,
                        overwrite=False,
                        resume=False,
                        observer=observer,
                        skip_video_occurrences=set(claim.ready_video_occurrences),
                    )
                self.spool.mark_pipeline_complete(claim.job_id)

            if heartbeat.lost:
                return RunOutcome(True, claim.job_id, reason="LEASE_LOST")
            try:
                publisher.flush()
            except OutboxPublishError:
                return RunOutcome(True, claim.job_id, reason="OUTBOX_UNAVAILABLE")
            if heartbeat.lost:
                return RunOutcome(True, claim.job_id, reason="LEASE_LOST")

            try:
                self._retry_complete(claim)
            except Exception:
                # A plan may have been interrupted with occurrences still active.
                # Let the next lease rerun the pipeline; READY occurrences are
                # skipped from the control-plane claim, not inferred locally.
                self.spool.mark_pipeline_incomplete(claim.job_id)
                return RunOutcome(True, claim.job_id, reason="COMPLETE_FAILED")
            self.spool.clear_completed_job(claim.job_id)
            return RunOutcome(True, claim.job_id, completed=True)
        finally:
            heartbeat.stop()

    def _run_finalization(
        self,
        claim: LeaseClaim,
        heartbeat: LeaseHeartbeat,
    ) -> RunOutcome:
        export_reference = claim.export_reference
        if claim.finalize_state != "EXPORTED":
            if self.finalizer is None:
                self._best_effort_export_report(
                    claim,
                    success=False,
                    export_reference=None,
                    cleanup_complete=False,
                    diagnostic_code="FINALIZER_NOT_CONFIGURED",
                )
                return RunOutcome(True, claim.job_id, reason="EXPORT_FAILED")
            try:
                export_reference = self.finalizer.export(claim)
            except Exception:
                self._best_effort_export_report(
                    claim,
                    success=False,
                    export_reference=None,
                    cleanup_complete=False,
                    diagnostic_code="EXPORT_FAILED",
                )
                return RunOutcome(True, claim.job_id, reason="EXPORT_FAILED")
            if heartbeat.lost:
                return RunOutcome(True, claim.job_id, reason="LEASE_LOST")
            try:
                self._retry_export_report(
                    claim,
                    success=True,
                    export_reference=export_reference,
                    cleanup_complete=False,
                )
            except Exception:
                return RunOutcome(True, claim.job_id, reason="EXPORT_CONFIRM_FAILED")

        if not export_reference:
            return RunOutcome(True, claim.job_id, reason="EXPORT_REFERENCE_MISSING")
        if self.finalizer is None:
            self._best_effort_export_report(
                claim,
                success=False,
                export_reference=export_reference,
                cleanup_complete=False,
                diagnostic_code="FINALIZER_NOT_CONFIGURED",
            )
            return RunOutcome(True, claim.job_id, reason="CLEANUP_FAILED")
        if heartbeat.lost:
            return RunOutcome(True, claim.job_id, reason="LEASE_LOST")
        try:
            self.finalizer.cleanup(claim, export_reference)
        except Exception:
            self._best_effort_export_report(
                claim,
                success=False,
                export_reference=export_reference,
                cleanup_complete=False,
                diagnostic_code="CLEANUP_FAILED",
            )
            return RunOutcome(True, claim.job_id, reason="CLEANUP_FAILED")
        if heartbeat.lost:
            return RunOutcome(True, claim.job_id, reason="LEASE_LOST")
        try:
            self._retry_export_report(
                claim,
                success=True,
                export_reference=export_reference,
                cleanup_complete=True,
            )
        except Exception:
            return RunOutcome(True, claim.job_id, reason="CLEANUP_CONFIRM_FAILED")
        return RunOutcome(True, claim.job_id, completed=True)

    def _claim_with_retry(self) -> LeaseClaim | None:
        last_error: Exception | None = None
        for attempt in range(1, 4):
            try:
                return self.client.claim(self.worker_id, self.lease_seconds)
            except Exception as error:
                last_error = error
                if isinstance(error, ControlPlaneError) and not error.retryable:
                    break
                if attempt < 3:
                    self.sleep(min(0.25 * (2 ** (attempt - 1)), 2.0))
        if last_error is not None:
            raise last_error
        return None

    def _retry_complete(self, claim: LeaseClaim) -> None:
        last_error: Exception | None = None
        for attempt in range(1, 4):
            try:
                self.client.complete(claim.job_id, self.worker_id, claim.lease_token)
                return
            except Exception as error:
                last_error = error
                if isinstance(error, ControlPlaneError) and not error.retryable:
                    break
                if attempt < 3:
                    self.sleep(min(0.25 * (2 ** (attempt - 1)), 2.0))
        if last_error is not None:
            raise last_error

    def _retry_export_report(
        self,
        claim: LeaseClaim,
        *,
        success: bool,
        export_reference: str | None,
        cleanup_complete: bool,
        diagnostic_code: str | None = None,
    ) -> None:
        last_error: Exception | None = None
        for attempt in range(1, 4):
            try:
                self.client.report_export(
                    claim.job_id,
                    self.worker_id,
                    claim.lease_token,
                    success=success,
                    export_reference=export_reference,
                    cleanup_complete=cleanup_complete,
                    diagnostic_code=diagnostic_code,
                )
                return
            except Exception as error:
                last_error = error
                if isinstance(error, ControlPlaneError) and not error.retryable:
                    break
                if attempt < 3:
                    self.sleep(min(0.25 * (2 ** (attempt - 1)), 2.0))
        if last_error is not None:
            raise last_error

    def _best_effort_export_report(
        self,
        claim: LeaseClaim,
        *,
        success: bool,
        export_reference: str | None,
        cleanup_complete: bool,
        diagnostic_code: str,
    ) -> None:
        with suppress(Exception):
            self._retry_export_report(
                claim,
                success=success,
                export_reference=export_reference,
                cleanup_complete=cleanup_complete,
                diagnostic_code=diagnostic_code,
            )
