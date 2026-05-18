from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from src.paths import ensure_dir, project_path, safe_slug


@dataclass
class VideoStatus:
    url: str
    title: str = ""
    status: str = "pending"
    output_path: str | None = None
    kept: bool = False
    error: str | None = None
    model_used: str | None = None


@dataclass
class JobManifest:
    playlist_title: str
    videos: list[VideoStatus] = field(default_factory=list)

    @classmethod
    def load_or_create(cls, path: Path, playlist_title: str) -> JobManifest:
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
            return cls(
                playlist_title=data.get("playlist_title", playlist_title),
                videos=[VideoStatus(**item) for item in data.get("videos", [])],
            )
        return cls(playlist_title=playlist_title)

    def save(self, path: Path) -> Path:
        ensure_dir(path.parent)
        path.write_text(
            json.dumps(asdict(self), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        return path

    def upsert_video(self, status: VideoStatus) -> None:
        for index, current in enumerate(self.videos):
            if current.url == status.url:
                self.videos[index] = status
                return
        self.videos.append(status)

    def get(self, url: str) -> VideoStatus | None:
        return next((video for video in self.videos if video.url == url), None)


def manifest_path_for_playlist(title_or_url: str) -> Path:
    return project_path("cache", "jobs", f"{safe_slug(title_or_url, 'playlist')}_manifest.json")


def manifest_summary(manifest: JobManifest) -> dict[str, Any]:
    return {
        "done": sum(1 for video in manifest.videos if video.status == "done"),
        "failed": sum(1 for video in manifest.videos if video.status == "failed"),
        "kept": sum(1 for video in manifest.videos if video.kept),
    }
