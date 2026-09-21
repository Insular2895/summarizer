from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from src.web_adapter import (
    DiscoveredVideo,
    ProgressEvent,
    SourcePlan,
    TranscriptBlock,
    VideoResult,
)
from src.worker.client import ControlPlaneError, HttpControlPlaneClient, LeaseClaim
from src.worker.heartbeat import LeaseHeartbeat
from src.worker.outbox import stable_video_id
from src.worker.runner import WorkerRunner
from src.worker.spool import WorkerSpool


class FakeControlPlane:
    def __init__(
        self,
        claims: list[LeaseClaim],
        *,
        fail_results: bool = False,
        fail_complete: bool = False,
        fail_export_confirmation: bool = False,
        log: list[str] | None = None,
    ) -> None:
        self.claims = claims
        self.fail_results = fail_results
        self.fail_complete = fail_complete
        self.fail_export_confirmation = fail_export_confirmation
        self.log = log if log is not None else []
        self.heartbeats = 0
        self.plans: list[dict[str, Any]] = []
        self.events: list[dict[str, Any]] = []
        self.results: list[tuple[str, dict[str, Any]]] = []
        self.errors: list[tuple[str, dict[str, Any]]] = []
        self.completed: list[str] = []
        self.export_reports: list[dict[str, Any]] = []

    def claim(self, _worker_id: str, _lease_seconds: int) -> LeaseClaim | None:
        return self.claims.pop(0) if self.claims else None

    def heartbeat(
        self,
        _job_id: str,
        _worker_id: str,
        _lease_token: str,
        _lease_seconds: int,
    ) -> None:
        self.heartbeats += 1

    def publish_event(
        self,
        _job_id: str,
        _worker_id: str,
        _lease_token: str,
        payload: dict[str, Any],
    ) -> None:
        self.events.append(payload)

    def publish_plan(
        self,
        _job_id: str,
        _worker_id: str,
        _lease_token: str,
        payload: dict[str, Any],
    ) -> None:
        self.plans.append(payload)

    def publish_result(
        self,
        _job_id: str,
        video_id: str,
        _worker_id: str,
        _lease_token: str,
        payload: dict[str, Any],
    ) -> None:
        if self.fail_results:
            raise ConnectionError("offline")
        self.results.append((video_id, payload))

    def publish_error(
        self,
        _job_id: str,
        video_id: str,
        _worker_id: str,
        _lease_token: str,
        payload: dict[str, Any],
    ) -> None:
        self.errors.append((video_id, payload))

    def complete(self, job_id: str, _worker_id: str, _lease_token: str) -> None:
        if self.fail_complete:
            raise ControlPlaneError(409, "JOB_INCOMPLETE", retryable=False)
        self.completed.append(job_id)

    def fetch_export_manifest(
        self,
        _job_id: str,
        _worker_id: str,
        _lease_token: str,
    ) -> dict[str, Any]:
        raise AssertionError("The fake finalizer does not fetch export data.")

    def fetch_export_item(
        self,
        _job_id: str,
        _video_id: str,
        _worker_id: str,
        _lease_token: str,
    ) -> dict[str, Any]:
        raise AssertionError("The fake finalizer does not fetch export data.")

    def report_export(
        self,
        _job_id: str,
        _worker_id: str,
        _lease_token: str,
        *,
        success: bool,
        export_reference: str | None,
        cleanup_complete: bool,
        diagnostic_code: str | None = None,
    ) -> None:
        self.log.append("confirm-cleanup" if cleanup_complete else "confirm-export")
        if self.fail_export_confirmation and success and not cleanup_complete:
            raise ConnectionError("confirmation offline")
        self.export_reports.append(
            {
                "success": success,
                "export_reference": export_reference,
                "cleanup_complete": cleanup_complete,
                "diagnostic_code": diagnostic_code,
            }
        )


def claim(token: str = "lease-secret-value") -> LeaseClaim:
    return LeaseClaim(
        job_id="job_fixture",
        source_url="https://www.youtube.com/watch?v=abcdefghijk",
        source_kind="youtube_video",
        lease_token=token,
        ready_video_occurrences=frozenset(),
    )


def finalize_claim(
    *,
    state: str = "EXPORTING",
    export_reference: str | None = None,
) -> LeaseClaim:
    return LeaseClaim(
        job_id="job_fixture",
        source_url="https://www.youtube.com/watch?v=abcdefghijk",
        source_kind="youtube_video",
        lease_token="finalize-lease",
        ready_video_occurrences=frozenset({("abcdefghijk", 1)}),
        work_kind="FINALIZE",
        finalize_state=state,
        export_reference=export_reference,
    )


class FakeFinalizer:
    def __init__(
        self,
        log: list[str],
        *,
        fail_export: bool = False,
        fail_cleanup: bool = False,
    ) -> None:
        self.log = log
        self.fail_export = fail_export
        self.fail_cleanup = fail_cleanup

    def export(self, _claim: LeaseClaim) -> str:
        self.log.append("write-export")
        if self.fail_export:
            raise OSError("outbox unavailable")
        return "output/graphipy_ready/job_fixture"

    def cleanup(self, _claim: LeaseClaim, _export_reference: str) -> None:
        self.log.append("cleanup")
        if self.fail_cleanup:
            raise OSError("cleanup unavailable")


def emitting_pipeline(_source: str, **kwargs: Any) -> None:
    observer = kwargs["observer"]
    observer.on_source_discovered(
        SourcePlan(
            title="Fixture",
            videos=(
                DiscoveredVideo(
                    youtube_id="abcdefghijk",
                    playlist_index=1,
                    title="Fixture",
                    url="https://www.youtube.com/watch?v=abcdefghijk",
                ),
            ),
        )
    )
    observer.on_event(
        ProgressEvent(
            event_id="evt_fixture",
            youtube_id="abcdefghijk",
            playlist_index=1,
            status="PROCESSING",
            stage="SUMMARIZATION",
            progress=0.5,
            occurred_at="2026-09-20T10:00:00Z",
        )
    )
    observer.on_video_ready(
        VideoResult(
            youtube_id="abcdefghijk",
            playlist_index=1,
            title="Fixture",
            url="https://www.youtube.com/watch?v=abcdefghijk",
            summary_markdown="# Fixture",
            model_used="fixture-model",
            transcript=(TranscriptBlock(0, 0, 1_000, "Texte"),),
            provenance={
                "source_type": "youtube",
                "source_url": "https://www.youtube.com/watch?v=abcdefghijk",
                "subtitle_format": "srt",
            },
        )
    )


def test_runner_claims_publishes_and_completes_without_inbound_server(tmp_path: Path) -> None:
    client = FakeControlPlane([claim()])
    spool = WorkerSpool(tmp_path / "spool")
    runner = WorkerRunner(
        client=client,
        spool=spool,
        worker_id="worker-one",
        pipeline=emitting_pipeline,
        sleep=lambda _seconds: None,
    )

    outcome = runner.run_once()

    assert outcome.completed is True
    assert client.completed == ["job_fixture"]
    assert len(client.plans) == 1
    assert len(client.events) == 1
    assert client.events[0]["event_id"] == "evt_fixture"
    assert len(client.results) == 1
    assert client.results[0][0].startswith("video_")
    assert not (tmp_path / "spool" / "job_fixture").exists()


def test_finalization_confirms_export_before_cleanup(tmp_path: Path) -> None:
    log: list[str] = []
    client = FakeControlPlane([finalize_claim()], log=log)
    runner = WorkerRunner(
        client=client,
        spool=WorkerSpool(tmp_path / "spool"),
        worker_id="worker-finalize",
        finalizer=FakeFinalizer(log),
        sleep=lambda _seconds: None,
    )

    outcome = runner.run_once()

    assert outcome.completed is True
    assert log == ["write-export", "confirm-export", "cleanup", "confirm-cleanup"]
    assert client.export_reports == [
        {
            "success": True,
            "export_reference": "output/graphipy_ready/job_fixture",
            "cleanup_complete": False,
            "diagnostic_code": None,
        },
        {
            "success": True,
            "export_reference": "output/graphipy_ready/job_fixture",
            "cleanup_complete": True,
            "diagnostic_code": None,
        },
    ]


def test_finalization_never_cleans_up_when_export_or_confirmation_fails(tmp_path: Path) -> None:
    export_log: list[str] = []
    export_client = FakeControlPlane([finalize_claim()], log=export_log)
    export_outcome = WorkerRunner(
        client=export_client,
        spool=WorkerSpool(tmp_path / "export-spool"),
        worker_id="worker-finalize",
        finalizer=FakeFinalizer(export_log, fail_export=True),
        sleep=lambda _seconds: None,
    ).run_once()

    assert export_outcome.reason == "EXPORT_FAILED"
    assert "cleanup" not in export_log
    assert export_client.export_reports[-1]["diagnostic_code"] == "EXPORT_FAILED"

    confirmation_log: list[str] = []
    confirmation_client = FakeControlPlane(
        [finalize_claim()],
        fail_export_confirmation=True,
        log=confirmation_log,
    )
    confirmation_outcome = WorkerRunner(
        client=confirmation_client,
        spool=WorkerSpool(tmp_path / "confirmation-spool"),
        worker_id="worker-finalize",
        finalizer=FakeFinalizer(confirmation_log),
        sleep=lambda _seconds: None,
    ).run_once()

    assert confirmation_outcome.reason == "EXPORT_CONFIRM_FAILED"
    assert confirmation_log == [
        "write-export",
        "confirm-export",
        "confirm-export",
        "confirm-export",
    ]
    assert "cleanup" not in confirmation_log


def test_finalization_resumes_at_cleanup_after_export_confirmation(tmp_path: Path) -> None:
    log: list[str] = []
    client = FakeControlPlane(
        [finalize_claim(state="EXPORTED", export_reference="output/graphipy_ready/job_fixture")],
        log=log,
    )
    outcome = WorkerRunner(
        client=client,
        spool=WorkerSpool(tmp_path / "spool"),
        worker_id="worker-finalize",
        finalizer=FakeFinalizer(log),
        sleep=lambda _seconds: None,
    ).run_once()

    assert outcome.completed is True
    assert log == ["cleanup", "confirm-cleanup"]


def test_cleanup_failure_preserves_confirmed_export_for_retry(tmp_path: Path) -> None:
    log: list[str] = []
    client = FakeControlPlane(
        [finalize_claim(state="EXPORTED", export_reference="output/graphipy_ready/job_fixture")],
        log=log,
    )
    outcome = WorkerRunner(
        client=client,
        spool=WorkerSpool(tmp_path / "spool"),
        worker_id="worker-finalize",
        finalizer=FakeFinalizer(log, fail_cleanup=True),
        sleep=lambda _seconds: None,
    ).run_once()

    assert outcome.reason == "CLEANUP_FAILED"
    assert log == ["cleanup", "confirm-export"]
    assert client.export_reports[-1] == {
        "success": False,
        "export_reference": "output/graphipy_ready/job_fixture",
        "cleanup_complete": False,
        "diagnostic_code": "CLEANUP_FAILED",
    }


def test_unpublished_result_survives_restart_without_persisting_credentials(tmp_path: Path) -> None:
    spool = WorkerSpool(tmp_path / "spool")
    offline = FakeControlPlane([claim()], fail_results=True)
    first_runner = WorkerRunner(
        client=offline,
        spool=spool,
        worker_id="worker-one",
        pipeline=emitting_pipeline,
        sleep=lambda _seconds: None,
    )

    first = first_runner.run_once()

    assert first.completed is False
    assert first.reason == "OUTBOX_UNAVAILABLE"
    assert spool.pipeline_complete("job_fixture") is True
    pending_files = list((tmp_path / "spool" / "job_fixture").glob("*.json"))
    assert len(pending_files) == 2  # one result plus the completion marker
    persisted = "\n".join(path.read_text(encoding="utf-8") for path in pending_files)
    assert "lease-secret-value" not in persisted

    online = FakeControlPlane([claim("new-lease-token")])

    def must_not_reprocess(_source: str, **_kwargs: Any) -> None:
        raise AssertionError("the completed local pipeline must be replayed, not rerun")

    second_runner = WorkerRunner(
        client=online,
        spool=spool,
        worker_id="worker-two",
        pipeline=must_not_reprocess,
        sleep=lambda _seconds: None,
    )
    second = second_runner.run_once()

    assert second.completed is True
    assert len(online.results) == 1
    assert online.completed == ["job_fixture"]
    assert not (tmp_path / "spool" / "job_fixture").exists()


def test_heartbeat_renews_until_stopped() -> None:
    client = FakeControlPlane([])
    heartbeat = LeaseHeartbeat(
        client=client,
        job_id="job_fixture",
        worker_id="worker-one",
        lease_token="lease-token",
        lease_seconds=15,
        interval_seconds=0.01,
    )

    heartbeat.start()
    time.sleep(0.04)
    heartbeat.stop()

    assert client.heartbeats >= 1
    assert heartbeat.lost is False


def test_runner_passes_server_ready_ids_as_the_resume_source_of_truth(tmp_path: Path) -> None:
    lease = claim()
    lease = LeaseClaim(
        job_id=lease.job_id,
        source_url=lease.source_url,
        source_kind=lease.source_kind,
        lease_token=lease.lease_token,
        ready_video_occurrences=frozenset({("already-ready", 2)}),
    )
    client = FakeControlPlane([lease])
    captured: dict[str, Any] = {}

    def pipeline(_source: str, **kwargs: Any) -> None:
        captured.update(kwargs)

    outcome = WorkerRunner(
        client=client,
        spool=WorkerSpool(tmp_path / "spool"),
        worker_id="worker-resume",
        pipeline=pipeline,
        sleep=lambda _seconds: None,
    ).run_once()

    assert outcome.completed is True
    assert captured["resume"] is False
    assert captured["skip_video_occurrences"] == {("already-ready", 2)}


def test_duplicate_youtube_ids_have_distinct_occurrence_ids() -> None:
    first = stable_video_id("job_fixture", "same-video", 1)
    repeated = stable_video_id("job_fixture", "same-video", 3)

    assert first != repeated
    assert first == stable_video_id("job_fixture", "same-video", 1)


def test_interrupted_playlist_is_rerun_and_skips_only_persisted_ready_occurrences(
    tmp_path: Path,
) -> None:
    spool = WorkerSpool(tmp_path / "spool")
    interrupted_client = FakeControlPlane([claim()], fail_complete=True)

    def interrupted_pipeline(_source: str, **kwargs: Any) -> None:
        observer = kwargs["observer"]
        observer.on_source_discovered(
            SourcePlan(
                title="Interrupted fixture",
                videos=(
                    DiscoveredVideo("same-video", 1, "First", "https://youtu.be/aaaaaaaaaaa"),
                    DiscoveredVideo("same-video", 3, "Repeated", "https://youtu.be/aaaaaaaaaaa"),
                ),
            )
        )
        observer.on_video_ready(
            VideoResult(
                youtube_id="same-video",
                playlist_index=1,
                title="First",
                url="https://youtu.be/aaaaaaaaaaa",
                summary_markdown="# First",
                model_used="fixture-model",
                transcript=(),
                provenance={
                    "source_type": "youtube",
                    "source_url": "https://youtu.be/aaaaaaaaaaa",
                    "subtitle_format": "srt",
                },
            )
        )
        raise RuntimeError("simulated interruption")

    first = WorkerRunner(
        client=interrupted_client,
        spool=spool,
        worker_id="worker-one",
        pipeline=interrupted_pipeline,
        sleep=lambda _seconds: None,
    ).run_once()

    assert first.reason == "COMPLETE_FAILED"
    assert spool.pipeline_complete("job_fixture") is False

    resumed_claim = claim("fresh-token")
    resumed_claim = LeaseClaim(
        job_id=resumed_claim.job_id,
        source_url=resumed_claim.source_url,
        source_kind=resumed_claim.source_kind,
        lease_token=resumed_claim.lease_token,
        ready_video_occurrences=frozenset({("same-video", 1)}),
    )
    resumed_client = FakeControlPlane([resumed_claim])
    captured: dict[str, Any] = {}

    def resumed_pipeline(_source: str, **kwargs: Any) -> None:
        captured.update(kwargs)

    second = WorkerRunner(
        client=resumed_client,
        spool=spool,
        worker_id="worker-two",
        pipeline=resumed_pipeline,
        sleep=lambda _seconds: None,
    ).run_once()

    assert second.completed is True
    assert captured["skip_video_occurrences"] == {("same-video", 1)}


def test_http_client_rejects_plain_http_outside_localhost() -> None:
    try:
        HttpControlPlaneClient("http://example.com", "token")
    except ValueError as error:
        assert "HTTPS" in str(error)
    else:
        raise AssertionError("plain remote HTTP must be rejected")
