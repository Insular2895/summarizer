"""Structured, optional boundary between the local pipeline and Web V1."""

from src.web_adapter.contracts import (
    CollectingObserver,
    DiscoveredVideo,
    PipelineObserver,
    ProgressEvent,
    SourcePlan,
    TranscriptBlock,
    VideoFailure,
    VideoResult,
)
from src.web_adapter.errors import PublicPipelineError, map_pipeline_error

__all__ = [
    "CollectingObserver",
    "DiscoveredVideo",
    "PipelineObserver",
    "ProgressEvent",
    "PublicPipelineError",
    "SourcePlan",
    "TranscriptBlock",
    "VideoFailure",
    "VideoResult",
    "map_pipeline_error",
]
