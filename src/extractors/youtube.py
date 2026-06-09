from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from yt_dlp import YoutubeDL

from src.paths import ensure_dir, project_path, safe_slug


@dataclass(frozen=True)
class YouTubeVideo:
    url: str
    title: str
    video_id: str
    slug: str


class YouTubeExtractor:
    def __init__(self, cache_dir: Path) -> None:
        self.cache_dir = ensure_dir(cache_dir)

    def get_video_info(self, url: str) -> YouTubeVideo:
        with YoutubeDL(self._options({"quiet": True, "skip_download": True})) as ydl:
            info = ydl.extract_info(url, download=False)
        if not isinstance(info, dict):
            raise RuntimeError("yt-dlp returned invalid video metadata.")
        return self._video_from_info(url, info)

    def list_playlist(self, url: str) -> tuple[str, list[YouTubeVideo]]:
        options = self._options({"quiet": True, "skip_download": True, "extract_flat": True})
        with YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=False)
        if not isinstance(info, dict):
            raise RuntimeError("yt-dlp returned invalid playlist metadata.")
        title = str(info.get("title") or "playlist")
        videos: list[YouTubeVideo] = []
        for entry in info.get("entries") or []:
            if not isinstance(entry, dict):
                continue
            video_url = entry.get("url") or entry.get("webpage_url")
            if video_url and not str(video_url).startswith("http"):
                video_url = f"https://www.youtube.com/watch?v={video_url}"
            if not video_url:
                continue
            videos.append(self._video_from_info(str(video_url), entry))
        return title, videos

    def download_subtitles(self, url: str, slug: str) -> Path:
        target_dir = ensure_dir(self.cache_dir / slug)
        output_template = str(target_dir / "%(title).120s.%(ext)s")
        errors: list[str] = []
        for language in ["en", "fr"]:
            before = set(target_dir.glob("*.srt")) | set(target_dir.glob("*.vtt"))
            options: dict[str, Any] = self._options(
                {
                    "quiet": True,
                    "skip_download": True,
                    "writesubtitles": True,
                    "writeautomaticsub": True,
                    "subtitleslangs": [language],
                    "subtitlesformat": "srt/vtt/best",
                    "outtmpl": output_template,
                }
            )
            try:
                with YoutubeDL(options) as ydl:
                    ydl.download([url])
            except Exception as exc:
                errors.append(f"{language}: {exc}")
                continue
            new_files = (set(target_dir.glob("*.srt")) | set(target_dir.glob("*.vtt"))) - before
            if new_files:
                return max(new_files, key=lambda path: path.stat().st_mtime)
        subtitle_files = sorted(
            [*target_dir.glob("*.srt"), *target_dir.glob("*.vtt")],
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        if not subtitle_files:
            detail = "; ".join(errors) if errors else "no subtitle file produced"
            raise RuntimeError(f"No subtitles found for this video ({detail}).")
        return subtitle_files[0]

    def _options(self, options: dict[str, Any]) -> dict[str, Any]:
        options = {
            "remote_components": ["ejs:github"],
            "sleep_interval_requests": 4,
            "sleep_interval": 8,
            "max_sleep_interval": 18,
            "sleep_interval_subtitles": 4,
            **options,
        }
        cookiefile = _find_cookiefile()
        if cookiefile is not None:
            options = {**options, "cookiefile": str(cookiefile)}
        return options

    def _video_from_info(self, url: str, info: dict[str, Any]) -> YouTubeVideo:
        title = str(info.get("title") or info.get("id") or "video")
        video_id = str(info.get("id") or safe_slug(url, "video"))
        slug = safe_slug(f"{title}-{video_id}", "video")
        webpage_url = str(info.get("webpage_url") or url)
        return YouTubeVideo(url=webpage_url, title=title, video_id=video_id, slug=slug)


def _find_cookiefile() -> Path | None:
    candidates = [project_path("cookies.txt"), Path.home() / "cookies.txt"]
    return next((path for path in candidates if path.exists()), None)
