import json

import pytest

from src.motion.schema import MotionOptions, reference_type_for_playlist_video
from src.summarizers.motion_director import MotionDirector


class FakeClient:
    def __init__(self, response: str) -> None:
        self.response = response
        self.prompt = ""
        self.content = ""

    def generate(self, prompt, content, model_config):  # type: ignore[no-untyped-def]
        self.prompt = prompt
        self.content = content
        return self.response


def valid_motion_result() -> dict[str, object]:
    return {
        "reference_type": "visual_reference",
        "creative_brief": {
            "objective": "Sell the product",
            "product": "iPhone case",
            "target_audience": "Premium tech buyers",
            "desired_style": "Minimal premium tech",
            "main_message": "Protection without bulk",
            "visual_positioning": "Product-first",
        },
        "reference_analysis": {
            "video_role": "Visual reference",
            "what_to_reuse": ["rhythm"],
            "what_to_avoid_copying": ["brand assets"],
            "rhythm": "controlled",
            "visual_codes": ["minimal"],
            "motion_codes": ["smooth easing"],
            "camera_movements": ["slow orbit"],
            "transition_style": ["match cut"],
            "lighting_style": "controlled studio light",
            "typography_style": "clean sans-serif",
        },
        "shot_list": [
            {
                "shot_number": 1,
                "time_range": "0:00-0:03",
                "visual_description": {"value": "Product reveal", "origin": "recommended"},
                "camera_motion": {"value": "Slow orbit", "origin": "recommended"},
                "product_action": {"value": "Case rotates", "origin": "recommended"},
                "text_on_screen": {"value": "Protection without bulk", "origin": "recommended"},
                "transition": {"value": "Fade", "origin": "recommended"},
                "purpose": "Hook",
            }
        ],
        "motion_prompt": {
            "main_prompt": "Create a premium 15-second vertical product video.",
            "negative_prompt": "No copied branding.",
            "style_reference_usage": "Use rhythm only.",
            "format": "9:16",
            "duration": "15s",
            "cta": "Available now",
            "attachments_needed": ["product image"],
        },
        "iteration_notes": {
            "first_run_goal": "Validate product proportions",
            "what_to_check_after_generation": ["Product accuracy"],
            "likely_corrections": ["Adjust pacing"],
        },
        "tutorial_takeaways": {
            "animation_method": [],
            "technical_steps": [],
            "applicable_to_motion_prompt": [],
            "not_relevant": [],
        },
    }


def test_reference_type_marks_video_9_mixed_and_last_8_as_tutorials() -> None:
    assert reference_type_for_playlist_video(9, 22, tutorials_last=8, mixed_indices={9}) == "mixed"
    assert reference_type_for_playlist_video(14, 22, tutorials_last=8, mixed_indices={9}) == (
        "visual_reference"
    )
    assert (
        reference_type_for_playlist_video(15, 22, tutorials_last=8, mixed_indices={9}) == "tutorial"
    )
    assert (
        reference_type_for_playlist_video(22, 22, tutorials_last=8, mixed_indices={9}) == "tutorial"
    )


def test_motion_director_generates_valid_json_with_options(tmp_path) -> None:
    client = FakeClient(f"```json\n{json.dumps(valid_motion_result())}\n```")
    director = MotionDirector(client=client)
    output_path = tmp_path / "motion.json"

    result_path, model = director.generate_motion_prompt_from_transcript(
        title="Reference",
        url="https://example.test/video",
        transcript="[00:00] A premium product appears.",
        output_path=output_path,
        options=MotionOptions(
            product_type="iPhone case",
            target_format="9:16",
            target_duration="15s",
            style="Apple-like premium tech without copying Apple",
            reference_type="visual_reference",
        ),
    )

    result = json.loads(result_path.read_text(encoding="utf-8"))
    assert result["motion_prompt"]["format"] == "9:16"
    assert result["source"]["title"] == "Reference"
    assert result["source"]["reference_type"] == "visual_reference"
    assert "iPhone case" in client.prompt
    assert "visual_reference" in client.prompt
    assert model


def test_motion_director_rejects_missing_required_sections(tmp_path) -> None:
    client = FakeClient('{"reference_type": "tutorial"}')
    director = MotionDirector(client=client)

    with pytest.raises(ValueError, match="Missing required Motion sections"):
        director.generate_motion_prompt_from_transcript(
            title="Tutorial",
            url="https://example.test/tutorial",
            transcript="Animate the layers.",
            output_path=tmp_path / "motion.json",
            options=MotionOptions(reference_type="tutorial"),
        )
