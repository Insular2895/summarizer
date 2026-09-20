from __future__ import annotations

import json
import socket
import subprocess
import time
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

import pytest

from src.web_adapter import TranscriptBlock, VideoResult
from src.worker.client import HttpControlPlaneClient
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

            outcome = WorkerRunner(
                client=HttpControlPlaneClient(base_url, "e2e-worker-token"),
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
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def _fake_pipeline(_source: str, **kwargs: Any) -> None:
    observer = kwargs["observer"]
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
