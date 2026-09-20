from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from src.web_adapter import ProgressEvent, TranscriptBlock, VideoResult
from src.worker.client import HttpControlPlaneClient, LeaseClaim
from src.worker.heartbeat import LeaseHeartbeat
from src.worker.runner import WorkerRunner
from src.worker.spool import WorkerSpool


class FakeControlPlane:
    def __init__(self, claims: list[LeaseClaim], *, fail_results: bool = False) -> None:
        self.claims = claims
        self.fail_results = fail_results
        self.heartbeats = 0
        self.events: list[dict[str, Any]] = []
        self.results: list[tuple[str, dict[str, Any]]] = []
        self.errors: list[tuple[str, dict[str, Any]]] = []
        self.completed: list[str] = []

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
        self.completed.append(job_id)


def claim(token: str = "lease-secret-value") -> LeaseClaim:
    return LeaseClaim(
        job_id="job_fixture",
        source_url="https://www.youtube.com/watch?v=abcdefghijk",
        source_kind="youtube_video",
        lease_token=token,
        ready_youtube_ids=frozenset(),
    )


def emitting_pipeline(_source: str, **kwargs: Any) -> None:
    observer = kwargs["observer"]
    observer.on_event(
        ProgressEvent(
            event_id="evt_fixture",
            youtube_id="abcdefghijk",
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
    assert len(client.events) == 1
    assert client.events[0]["event_id"] == "evt_fixture"
    assert len(client.results) == 1
    assert client.results[0][0].startswith("video_")
    assert not (tmp_path / "spool" / "job_fixture").exists()


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
        ready_youtube_ids=frozenset({"already-ready"}),
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
    assert captured["skip_youtube_ids"] == {"already-ready"}


def test_http_client_rejects_plain_http_outside_localhost() -> None:
    try:
        HttpControlPlaneClient("http://example.com", "token")
    except ValueError as error:
        assert "HTTPS" in str(error)
    else:
        raise AssertionError("plain remote HTTP must be rejected")
