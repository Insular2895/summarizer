from __future__ import annotations

import json
import socket
import subprocess
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

import pytest

from src.web_adapter import (
    DiscoveredVideo,
    SourcePlan,
    TranscriptBlock,
    VideoFailure,
    VideoResult,
)
from src.worker.client import HttpControlPlaneClient
from src.worker.graphipy_finalizer import GraphipyOutboxFinalizer
from src.worker.runner import WorkerRunner
from src.worker.spool import WorkerSpool

ROOT = Path(__file__).resolve().parents[1]
WRANGLER = ROOT / "cloudflare" / "node_modules" / ".bin" / "wrangler"


@pytest.mark.skipif(not WRANGLER.exists(), reason="Cloudflare npm dependencies are not installed")
def test_single_video_crosses_real_local_http_and_d1_boundaries(tmp_path: Path) -> None:
    """No YouTube or LLM network call: only the local Worker boundary is real."""
    state_dir = tmp_path / "wrangler-state"
    subprocess.run(
        [
            str(WRANGLER),
            "d1",
            "migrations",
            "apply",
            "DB",
            "--local",
            "--persist-to",
            str(state_dir),
        ],
        cwd=ROOT / "cloudflare",
        check=True,
        capture_output=True,
        text=True,
    )
    port = _free_port()
    log_path = tmp_path / "wrangler.log"
    with log_path.open("w+", encoding="utf-8") as log:
        process = subprocess.Popen(
            [
                str(WRANGLER),
                "dev",
                "--ip",
                "127.0.0.1",
                "--port",
                str(port),
                "--persist-to",
                str(state_dir),
                "--var",
                "APP_ENV:local",
                "--var",
                "WORKER_API_TOKEN:e2e-worker-token",
                "--log-level",
                "error",
            ],
            cwd=ROOT / "cloudflare",
            stdout=log,
            stderr=subprocess.STDOUT,
            text=True,
        )
        try:
            base_url = f"http://127.0.0.1:{port}"
            _wait_until_healthy(base_url, process, log)
            receipt = _json_request(
                f"{base_url}/api/sources",
                method="POST",
                headers={
                    "X-Summarizer-User": "e2e@example.test",
                    "Idempotency-Key": "e2e-single-video-0001",
                },
                payload={"url": "https://www.youtube.com/watch?v=abcdefghijk"},
            )

            control_client = HttpControlPlaneClient(base_url, "e2e-worker-token")
            outcome = WorkerRunner(
                client=control_client,
                spool=WorkerSpool(tmp_path / "spool"),
                worker_id="e2e-worker",
                pipeline=_fake_pipeline,
                sleep=lambda _seconds: None,
            ).run_once()

            assert outcome.completed is True
            review = _json_request(
                f"{base_url}/api/review",
                headers={"X-Summarizer-User": "e2e@example.test"},
            )
            assert len(review["videos"]) == 1
            video_id = review["videos"][0]["id"]
            detail = _json_request(
                f"{base_url}/api/videos/{video_id}",
                headers={"X-Summarizer-User": "e2e@example.test"},
            )
            assert detail["video"]["title"] == "Vidéo E2E"
            assert detail["video"]["summary_markdown"] == "# Résumé E2E"
            assert detail["transcript"][0]["start_ms"] == 1_000
            assert receipt["job"]["id"] == outcome.job_id

            _json_request(
                f"{base_url}/api/videos/{video_id}/note",
                method="PUT",
                headers={"X-Summarizer-User": "e2e@example.test"},
                payload={
                    "body": "Note E2E",
                    "excerpts": [{"text": "Contenu vérifiable.", "start_ms": 1_000}],
                    "base_version": 1,
                },
            )
            _json_request(
                f"{base_url}/api/videos/{video_id}/decision",
                method="PUT",
                headers={"X-Summarizer-User": "e2e@example.test"},
                payload={"decision": "KEPT", "base_version": 1},
            )
            _json_request(
                f"{base_url}/api/jobs/{receipt['job']['id']}/finalize",
                method="POST",
                headers={
                    "X-Summarizer-User": "e2e@example.test",
                    "Idempotency-Key": "e2e-finalize-0001",
                },
                payload={},
            )
            export_root = tmp_path / "graphipy-ready"
            finalized = WorkerRunner(
                client=control_client,
                spool=WorkerSpool(tmp_path / "finalize-spool"),
                worker_id="e2e-finalizer",
                finalizer=GraphipyOutboxFinalizer(
                    control_client,
                    "e2e-finalizer",
                    export_root,
                ),
                sleep=lambda _seconds: None,
            ).run_once()

            assert finalized.completed is True
            export_dir = export_root / receipt["job"]["id"]
            exported_markdown = next(export_dir.glob("*.md")).read_text(encoding="utf-8")
            assert "Note E2E" in exported_markdown
            assert "[0:01]" in exported_markdown
            assert 'decision: "KEPT"' in exported_markdown
            assert (export_dir / "_export.json").is_file()
            history = _json_request(
                f"{base_url}/api/history",
                headers={"X-Summarizer-User": "e2e@example.test"},
            )
            assert history["entries"][0]["kept_videos"] == 1
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


@pytest.mark.skipif(not WRANGLER.exists(), reason="Cloudflare npm dependencies are not installed")
def test_playlist_is_progressive_across_real_local_http_and_d1_boundaries(
    tmp_path: Path,
) -> None:
    observed_during_pipeline: dict[str, Any] = {}

    with _local_control_plane(tmp_path) as base_url:
        receipt = _json_request(
            f"{base_url}/api/sources",
            method="POST",
            headers={
                "X-Summarizer-User": "playlist-e2e@example.test",
                "Idempotency-Key": "e2e-playlist-0001",
            },
            payload={"url": "https://www.youtube.com/playlist?list=PL1234567890"},
        )

        def progressive_pipeline(_source: str, **kwargs: Any) -> None:
            observer = kwargs["observer"]
            observer.on_source_discovered(
                SourcePlan(
                    title="Playlist E2E",
                    videos=(
                        DiscoveredVideo(
                            "aaaaaaaaaaa",
                            1,
                            "Première",
                            "https://www.youtube.com/watch?v=aaaaaaaaaaa",
                        ),
                        DiscoveredVideo(
                            "bbbbbbbbbbb",
                            2,
                            "En erreur",
                            "https://www.youtube.com/watch?v=bbbbbbbbbbb",
                        ),
                        DiscoveredVideo(
                            "aaaaaaaaaaa",
                            3,
                            "Première (copie)",
                            "https://www.youtube.com/watch?v=aaaaaaaaaaa",
                        ),
                    ),
                )
            )
            observer.on_video_ready(_video_result("aaaaaaaaaaa", 1, "Première"))
            observed_during_pipeline.update(
                _json_request(
                    f"{base_url}/api/review",
                    headers={"X-Summarizer-User": "playlist-e2e@example.test"},
                )
            )
            observer.on_video_failed(
                VideoFailure(
                    youtube_id="bbbbbbbbbbb",
                    playlist_index=2,
                    title="En erreur",
                    url="https://www.youtube.com/watch?v=bbbbbbbbbbb",
                    public_error="Sous-titres indisponibles.",
                    diagnostic_code="SUBTITLES_UNAVAILABLE",
                )
            )
            observer.on_video_ready(_video_result("aaaaaaaaaaa", 3, "Première (copie)"))

        outcome = WorkerRunner(
            client=HttpControlPlaneClient(base_url, "e2e-worker-token"),
            spool=WorkerSpool(tmp_path / "playlist-spool"),
            worker_id="playlist-e2e-worker",
            pipeline=progressive_pipeline,
            sleep=lambda _seconds: None,
        ).run_once()

        assert outcome.completed is True
        assert [video["playlist_index"] for video in observed_during_pipeline["videos"]] == [1]
        detail = _json_request(
            f"{base_url}/api/jobs/{receipt['job']['id']}",
            headers={"X-Summarizer-User": "playlist-e2e@example.test"},
        )
        assert detail["job"]["stage"] == "PROCESSING_COMPLETE"
        assert detail["job"]["progress"] == 1
        assert [video["state"] for video in detail["videos"]] == ["READY", "FAILED", "READY"]
        assert detail["videos"][0]["id"] != detail["videos"][2]["id"]


def _fake_pipeline(_source: str, **kwargs: Any) -> None:
    observer = kwargs["observer"]
    observer.on_source_discovered(
        SourcePlan(
            title="Vidéo E2E",
            videos=(
                DiscoveredVideo(
                    youtube_id="abcdefghijk",
                    playlist_index=1,
                    title="Vidéo E2E",
                    url="https://www.youtube.com/watch?v=abcdefghijk",
                ),
            ),
        )
    )
    observer.on_video_ready(
        VideoResult(
            youtube_id="abcdefghijk",
            playlist_index=1,
            title="Vidéo E2E",
            url="https://www.youtube.com/watch?v=abcdefghijk",
            summary_markdown="# Résumé E2E",
            model_used="fixture-model",
            transcript=(TranscriptBlock(0, 1_000, 2_000, "Contenu vérifiable."),),
            provenance={
                "source_type": "youtube",
                "source_url": "https://www.youtube.com/watch?v=abcdefghijk",
                "subtitle_format": "srt",
            },
            channel="Chaîne fixture",
            duration_seconds=60,
        )
    )


def _video_result(youtube_id: str, playlist_index: int, title: str) -> VideoResult:
    url = f"https://www.youtube.com/watch?v={youtube_id}"
    return VideoResult(
        youtube_id=youtube_id,
        playlist_index=playlist_index,
        title=title,
        url=url,
        summary_markdown=f"# {title}",
        model_used="fixture-model",
        transcript=(TranscriptBlock(0, 1_000, 2_000, "Contenu vérifiable."),),
        provenance={
            "source_type": "youtube",
            "source_url": url,
            "subtitle_format": "srt",
        },
    )


@contextmanager
def _local_control_plane(tmp_path: Path) -> Iterator[str]:
    state_dir = tmp_path / "playlist-wrangler-state"
    subprocess.run(
        [
            str(WRANGLER),
            "d1",
            "migrations",
            "apply",
            "DB",
            "--local",
            "--persist-to",
            str(state_dir),
        ],
        cwd=ROOT / "cloudflare",
        check=True,
        capture_output=True,
        text=True,
    )
    port = _free_port()
    log_path = tmp_path / "playlist-wrangler.log"
    with log_path.open("w+", encoding="utf-8") as log:
        process = subprocess.Popen(
            [
                str(WRANGLER),
                "dev",
                "--ip",
                "127.0.0.1",
                "--port",
                str(port),
                "--persist-to",
                str(state_dir),
                "--var",
                "APP_ENV:local",
                "--var",
                "WORKER_API_TOKEN:e2e-worker-token",
                "--log-level",
                "error",
            ],
            cwd=ROOT / "cloudflare",
            stdout=log,
            stderr=subprocess.STDOUT,
            text=True,
        )
        try:
            base_url = f"http://127.0.0.1:{port}"
            _wait_until_healthy(base_url, process, log)
            yield base_url
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def _json_request(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    request_headers = {"Accept": "application/json", **(headers or {})}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    request = Request(url, data=data, headers=request_headers, method=method)
    with urlopen(request, timeout=10) as response:  # noqa: S310
        decoded = json.loads(response.read())
    assert isinstance(decoded, dict)
    return decoded


def _wait_until_healthy(base_url: str, process: subprocess.Popen[str], log: Any) -> None:
    for _ in range(100):
        if process.poll() is not None:
            break
        try:
            response = _json_request(f"{base_url}/api/health")
            if response.get("status") == "ok":
                return
        except (OSError, URLError):
            time.sleep(0.05)
    log.flush()
    log.seek(0)
    raise AssertionError(f"Wrangler did not become healthy.\n{log.read()[-4_000:]}")


def _free_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])
