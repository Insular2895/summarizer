from __future__ import annotations

from pathlib import Path
from typing import Any

from src.pdf_evidence.core import ReviewStatus, write_json


def record_codex_visual_fallback(
    packet: Path,
    *,
    element_id: str,
    media_available: bool,
    disagreements: list[dict[str, Any]] | None = None,
    ambiguous_regions: list[dict[str, Any]] | None = None,
) -> Path:
    """Record the local visual fallback without touching the transcription."""
    disagreements = disagreements or []
    ambiguous_regions = ambiguous_regions or []
    evidence_opened = media_available and all(
        (packet / name).exists()
        for name in ("full_page_original.png", "element_crop_normalized.png")
    )
    if not evidence_opened:
        status = ReviewStatus.HUMAN_REVIEW_REQUIRED
        reason = "codex_media_unavailable"
    elif disagreements or ambiguous_regions:
        status = ReviewStatus.HUMAN_REVIEW_REQUIRED
        reason = "codex_visual_ambiguity_persists"
    else:
        # A model-only agreement is useful review evidence, not human truth.
        status = ReviewStatus.MACHINE_REVIEWED
        reason = "codex_visual_evidence_readable"
    return write_json(
        packet / "codex_fallback_review.json",
        {
            "schema_version": "1.0",
            "reviewer": "codex_visual_fallback",
            "element_id": element_id,
            "evidence_opened": evidence_opened,
            "disagreements": disagreements,
            "ambiguous_regions": ambiguous_regions,
            "recommended_status": status.value,
            "reason": reason,
        },
    )
