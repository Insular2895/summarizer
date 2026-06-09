from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, Literal

ReferenceType = Literal["visual_reference", "tutorial", "mixed"]

REQUIRED_MOTION_SECTIONS = {
    "reference_type",
    "creative_brief",
    "reference_analysis",
    "shot_list",
    "motion_prompt",
    "iteration_notes",
    "tutorial_takeaways",
}


@dataclass(frozen=True)
class MotionOptions:
    product_type: str = "premium tech product"
    target_format: str = "9:16"
    target_duration: str = "15s"
    style: str = "premium minimal tech, inspired by high-end product films without copying brands"
    reference_type: ReferenceType = "visual_reference"
    language: str = "fr"
    output_prompt_language: str = "en"
    user_description: str = ""

    def with_reference_type(self, reference_type: ReferenceType) -> MotionOptions:
        return replace(self, reference_type=reference_type)


def reference_type_for_playlist_video(
    index: int,
    total: int,
    tutorials_last: int = 0,
    mixed_indices: set[int] | None = None,
) -> ReferenceType:
    if index < 1 or index > total:
        raise ValueError("Playlist video index must be within the playlist.")
    if index in (mixed_indices or set()):
        return "mixed"
    tutorial_start = total - tutorials_last + 1
    if tutorials_last > 0 and index >= tutorial_start:
        return "tutorial"
    return "visual_reference"


def validate_motion_result(result: Any) -> dict[str, Any]:
    if not isinstance(result, dict):
        raise ValueError("Motion output must be a JSON object.")
    missing = REQUIRED_MOTION_SECTIONS - set(result)
    if missing:
        raise ValueError(f"Missing required Motion sections: {', '.join(sorted(missing))}")
    if result["reference_type"] not in {"visual_reference", "tutorial", "mixed"}:
        raise ValueError("Invalid reference_type in Motion output.")
    if not isinstance(result["shot_list"], list):
        raise ValueError("Motion shot_list must be a JSON array.")
    motion_prompt = result["motion_prompt"]
    if not isinstance(motion_prompt, dict) or not motion_prompt.get("main_prompt"):
        raise ValueError("Motion output requires motion_prompt.main_prompt.")
    return result
