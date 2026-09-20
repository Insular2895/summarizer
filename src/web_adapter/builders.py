from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from src.converters.subtitle_timestamps import TimestampedTextBlock
from src.extractors.youtube import YouTubeVideo
from src.web_adapter.contracts import (
    PipelineStatus,
    ProgressEvent,
    TranscriptBlock,
    VideoFailure,
    VideoResult,
)
from src.web_adapter.errors import map_pipeline_error


def progress_event(
    video: YouTubeVideo,
    *,
    status: PipelineStatus,
    stage: str,
    progress: float | None,
    diagnostic_code: str | None = None,
) -> ProgressEvent:
    if status not in {"QUEUED", "PROCESSING", "READY", "FAILED"}:
        raise ValueError(f"Unsupported pipeline status: {status}")
    return ProgressEvent(
        event_id=f"evt_{uuid4().hex}",
        youtube_id=video.video_id,
        status=status,
        stage=stage,
        progress=progress,
        occurred_at=datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        diagnostic_code=diagnostic_code,
    )


def video_result(
    video: YouTubeVideo,
    *,
    playlist_index: int,
    output_path: Path,
    model_used: str | None,
    subtitle_path: Path | None,
    timestamped_blocks: list[TimestampedTextBlock],
) -> VideoResult:
    subtitle_format = subtitle_path.suffix.lower().lstrip(".") if subtitle_path else "unavailable"
    return VideoResult(
        youtube_id=video.video_id,
        playlist_index=playlist_index,
        title=video.title,
        url=video.url,
        summary_markdown=_without_frontmatter(output_path.read_text(encoding="utf-8")),
        model_used=model_used,
        transcript=tuple(
            TranscriptBlock(
                block_index=block.block_index,
                start_ms=block.start_ms,
                end_ms=block.end_ms,
                text=block.text,
            )
            for block in timestamped_blocks
        ),
        provenance={
            "source_type": "youtube",
            "source_url": video.url,
            "subtitle_format": subtitle_format,
        },
    )


def video_failure(video: YouTubeVideo, *, playlist_index: int, error: Exception) -> VideoFailure:
    public = map_pipeline_error(error)
    return VideoFailure(
        youtube_id=video.video_id,
        playlist_index=playlist_index,
        title=video.title,
        url=video.url,
        public_error=public.message,
        diagnostic_code=public.diagnostic_code,
    )


def _without_frontmatter(markdown: str) -> str:
    if not markdown.startswith("---\n"):
        return markdown.strip()
    closing = markdown.find("\n---\n", 4)
    return markdown[closing + 5 :].strip() if closing >= 0 else markdown.strip()
