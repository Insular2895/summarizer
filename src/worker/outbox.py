from __future__ import annotations

import hashlib
import time
from collections.abc import Callable
from contextlib import suppress

from src.web_adapter import PipelineObserver, ProgressEvent, VideoFailure, VideoResult
from src.worker.client import ControlPlaneClient, ControlPlaneError
from src.worker.spool import OutboxRecord, WorkerSpool


class OutboxPublishError(RuntimeError):
    pass


class OutboxPublisher:
    def __init__(
        self,
        *,
        client: ControlPlaneClient,
        spool: WorkerSpool,
        job_id: str,
        worker_id: str,
        lease_token: str,
        max_attempts: int = 3,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.client = client
        self.spool = spool
        self.job_id = job_id
        self.worker_id = worker_id
        self.lease_token = lease_token
        self.max_attempts = max(1, max_attempts)
        self.sleep = sleep

    def flush(self) -> None:
        for path, record in self.spool.records(self.job_id):
            self._publish_with_retry(record)
            self.spool.acknowledge(path)

    def _publish_with_retry(self, record: OutboxRecord) -> None:
        last_error: Exception | None = None
        for attempt in range(1, self.max_attempts + 1):
            try:
                self._publish(record)
                return
            except Exception as error:
                last_error = error
                retryable = not isinstance(error, ControlPlaneError) or error.retryable
                if not retryable or attempt == self.max_attempts:
                    break
                self.sleep(min(0.25 * (2 ** (attempt - 1)), 2.0))
        code = (
            last_error.diagnostic_code
            if isinstance(last_error, ControlPlaneError)
            else "OUTBOX_PUBLISH_FAILED"
        )
        raise OutboxPublishError(f"Worker outbox publication failed ({code}).") from None

    def _publish(self, record: OutboxRecord) -> None:
        if record.kind == "event":
            self.client.publish_event(
                self.job_id,
                self.worker_id,
                self.lease_token,
                record.payload,
            )
            return
        if not record.video_id:
            raise OutboxPublishError("A video outbox record is missing its video id.")
        if record.kind == "result":
            self.client.publish_result(
                self.job_id,
                record.video_id,
                self.worker_id,
                self.lease_token,
                record.payload,
            )
            return
        self.client.publish_error(
            self.job_id,
            record.video_id,
            self.worker_id,
            self.lease_token,
            record.payload,
        )


class SpoolingObserver(PipelineObserver):
    """Persist before best-effort publication; failed sends remain replayable."""

    def __init__(self, job_id: str, spool: WorkerSpool, publisher: OutboxPublisher) -> None:
        self.job_id = job_id
        self.spool = spool
        self.publisher = publisher

    def on_event(self, event: ProgressEvent) -> None:
        payload = event.as_payload()
        youtube_id = str(payload.pop("youtube_id"))
        payload["video_id"] = stable_video_id(self.job_id, youtube_id)
        self.spool.enqueue("event", self.job_id, payload)
        self._best_effort_flush()

    def on_video_ready(self, result: VideoResult) -> None:
        video_id = stable_video_id(self.job_id, result.youtube_id)
        self.spool.enqueue("result", self.job_id, result.as_payload(), video_id=video_id)
        self._best_effort_flush()

    def on_video_failed(self, failure: VideoFailure) -> None:
        video_id = stable_video_id(self.job_id, failure.youtube_id)
        self.spool.enqueue("error", self.job_id, failure.as_payload(), video_id=video_id)
        self._best_effort_flush()

    def _best_effort_flush(self) -> None:
        with suppress(OutboxPublishError):
            self.publisher.flush()


def stable_video_id(job_id: str, youtube_id: str) -> str:
    digest = hashlib.sha256(f"{job_id}\0{youtube_id}".encode()).hexdigest()[:24]
    return f"video_{digest}"
