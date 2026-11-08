from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from src.llm.base import LLMQuotaError
from src.paths import project_path
from src.pipeline import run_playlist

RETRY_DELAY = timedelta(minutes=15)


def _now() -> str:
    return datetime.now(UTC).isoformat()


def canonical_youtube_url(value: str) -> str:
    """Validate a YouTube source and strip tracking parameters from persisted job state."""
    parsed = urlparse(value.strip())
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or host not in {
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "youtu.be",
    }:
        raise ValueError("URL YouTube invalide.")

    query = parse_qs(parsed.query)
    if "list" in query and query["list"]:
        return urlunparse(
            ("https", "www.youtube.com", "/playlist", "", urlencode({"list": query["list"][0]}), "")
        )
    if host == "youtu.be" and parsed.path.strip("/"):
        return urlunparse(
            ("https", "www.youtube.com", "/watch", "", urlencode({"v": parsed.path.strip("/")}), "")
        )
    if parsed.path == "/watch" and query.get("v"):
        return urlunparse(
            ("https", "www.youtube.com", "/watch", "", urlencode({"v": query["v"][0]}), "")
        )
    raise ValueError("Ajoute une URL de vidéo ou de playlist YouTube complète.")


class JobState:
    def __init__(self, path: Path, job_id: str, source_url: str) -> None:
        expected_root = project_path("cache", "web_jobs").resolve()
        resolved = path.resolve()
        if resolved.parent != expected_root or resolved.suffix != ".json":
            raise ValueError("Chemin d'état de job invalide.")
        self.path = resolved
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.data = self._read()
        created_at = self.data.get("createdAt") or _now()
        self.data.update(
            {
                "id": job_id,
                "url": canonical_youtube_url(source_url),
                "createdAt": created_at,
                "updatedAt": _now(),
            }
        )

    def _read(self) -> dict[str, Any]:
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def update(self, **changes: Any) -> None:
        self.data.update(changes, updatedAt=_now())
        temporary = self.path.with_suffix(f".tmp-{os.getpid()}")
        temporary.write_text(
            json.dumps(self.data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        temporary.replace(self.path)

    def on_progress(self, event: dict[str, Any]) -> None:
        event_name = event.get("event")
        changes: dict[str, Any] = {
            "title": event.get("title") or self.data.get("title") or "Playlist YouTube",
            "total": event.get("total", self.data.get("total", 0)),
            "done": event.get("done", self.data.get("done", 0)),
            "failed": event.get("failed", self.data.get("failed", 0)),
            "currentVideo": event.get("video_title") or self.data.get("currentVideo"),
        }
        if event.get("batch_number"):
            changes.update(
                batchSize=event.get("batch_size", 50),
                currentBatch=event["batch_number"],
                totalBatches=event.get("total_batches"),
                batchStart=event.get("batch_start"),
                batchEnd=event.get("batch_end"),
            )
        if event.get("output_dir"):
            changes["outputDir"] = event["output_dir"]
        if event.get("manifest_path"):
            changes["manifestPath"] = event["manifest_path"]
        if event_name == "quota_paused":
            changes.update(
                status="paused_quota",
                error="quota_exhausted",
                nextRetryAt=(datetime.now(UTC) + RETRY_DELAY).isoformat(),
            )
        else:
            changes.update(status="running", error=None, nextRetryAt=None)
        self.update(**changes)


def run_job(job_id: str, source_url: str, state_path: Path) -> int:
    state = JobState(state_path, job_id, source_url)
    state.update(
        status="running",
        error=None,
        nextRetryAt=None,
        workerPid=os.getpid(),
        startedAt=state.data.get("startedAt") or _now(),
    )
    try:
        manifest = run_playlist(
            state.data["url"],
            resume=True,
            keep_all=True,
            progress_callback=state.on_progress,
        )
    except LLMQuotaError:
        if state.data.get("status") != "paused_quota":
            state.update(
                status="paused_quota",
                error="quota_exhausted",
                nextRetryAt=(datetime.now(UTC) + RETRY_DELAY).isoformat(),
                workerPid=None,
            )
        else:
            state.update(workerPid=None)
        return 75
    except Exception as exc:
        state.update(
            status="failed",
            error=_safe_failure(exc),
            nextRetryAt=None,
            workerPid=None,
        )
        return 1

    state.update(
        status="completed",
        done=sum(1 for item in manifest.videos if item.status == "done"),
        failed=sum(1 for item in manifest.videos if item.status == "failed"),
        currentVideo=None,
        error=None,
        nextRetryAt=None,
        workerPid=None,
        finishedAt=_now(),
    )
    return 0


def _safe_failure(error: Exception) -> str:
    message = str(error).lower()
    if "pagination is incomplete" in message:
        return "youtube_pagination_incomplete"
    if "youtube" in message or "subtitle" in message or "transcript" in message:
        return "youtube_source_unavailable"
    if "api key" in message or "clé api" in message:
        return "api_key_required"
    return type(error).__name__


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a resumable local YouTube playlist job.")
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--url", required=True)
    parser.add_argument("--state", type=Path, required=True)
    args = parser.parse_args()
    return run_job(args.job_id, args.url, args.state)


if __name__ == "__main__":
    sys.exit(main())
