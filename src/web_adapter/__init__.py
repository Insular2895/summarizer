"""Structured, optional boundary between the local pipeline and Web V1."""

from src.web_adapter.contracts import (
    CollectingObserver,
    PipelineObserver,
    ProgressEvent,
    TranscriptBlock,
    VideoFailure,
    VideoResult,
)
from src.web_adapter.errors import PublicPipelineError, map_pipeline_error

__all__ = [
    "CollectingObserver",
    "PipelineObserver",
    "ProgressEvent",
    "PublicPipelineError",
    "TranscriptBlock",
    "VideoFailure",
    "VideoResult",
    "map_pipeline_error",
]
