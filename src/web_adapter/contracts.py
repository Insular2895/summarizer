from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal, Protocol

PipelineStatus = Literal["QUEUED", "PROCESSING", "READY", "FAILED"]


@dataclass(frozen=True, slots=True)
class TranscriptBlock:
    block_index: int
    start_ms: int
    end_ms: int | None
    text: str

    def as_payload(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class ProgressEvent:
    event_id: str
    youtube_id: str
    playlist_index: int
    status: PipelineStatus
    stage: str
    progress: float | None
    occurred_at: str
    diagnostic_code: str | None = None

    def as_payload(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class VideoResult:
    youtube_id: str
    playlist_index: int
    title: str
    url: str
    summary_markdown: str
    model_used: str | None
    transcript: tuple[TranscriptBlock, ...]
    provenance: dict[str, str]
    channel: str | None = None
    duration_seconds: int | None = None

    def as_payload(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["transcript"] = [block.as_payload() for block in self.transcript]
        return payload


@dataclass(frozen=True, slots=True)
class VideoFailure:
    youtube_id: str
    playlist_index: int
    title: str
    url: str
    public_error: str
    diagnostic_code: str

    def as_payload(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class DiscoveredVideo:
    youtube_id: str
    playlist_index: int
    title: str
    url: str

    def as_payload(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class SourcePlan:
    title: str
    videos: tuple[DiscoveredVideo, ...]

    def as_payload(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "videos": [video.as_payload() for video in self.videos],
        }


class PipelineObserver(Protocol):
    def on_source_discovered(self, plan: SourcePlan) -> None: ...

    def on_event(self, event: ProgressEvent) -> None: ...

    def on_video_ready(self, result: VideoResult) -> None: ...

    def on_video_failed(self, failure: VideoFailure) -> None: ...


@dataclass(slots=True)
class CollectingObserver:
    """In-memory observer used by tests and by the future worker spool."""

    plans: list[SourcePlan] = field(default_factory=list)
    events: list[ProgressEvent] = field(default_factory=list)
    ready: list[VideoResult] = field(default_factory=list)
    failed: list[VideoFailure] = field(default_factory=list)

    def on_event(self, event: ProgressEvent) -> None:
        self.events.append(event)

    def on_video_ready(self, result: VideoResult) -> None:
        self.ready.append(result)

    def on_video_failed(self, failure: VideoFailure) -> None:
        self.failed.append(failure)

    def on_source_discovered(self, plan: SourcePlan) -> None:
        self.plans.append(plan)
