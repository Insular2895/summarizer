from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from src.converters.token_counter import count_tokens
from src.llm.gemini_client import GeminiClient
from src.llm.model_router import ModelRouter
from src.motion.schema import MotionOptions, validate_motion_result
from src.paths import ensure_dir, project_path


class MotionDirector:
    def __init__(
        self,
        client: GeminiClient | None = None,
        router: ModelRouter | None = None,
        prompt_path: Path | None = None,
    ) -> None:
        self.client = client
        self.router = router or ModelRouter()
        self.prompt_path = prompt_path or project_path("prompts", "motion_director.md")

    def generate_motion_prompt_from_transcript(
        self,
        title: str,
        url: str,
        transcript: str,
        output_path: Path,
        options: MotionOptions,
    ) -> tuple[Path, str]:
        model = self.router.for_video(count_tokens(transcript))
        client = self.client or GeminiClient()
        prompt = self.prompt_path.read_text(encoding="utf-8")
        options_json = json.dumps(options.__dict__, ensure_ascii=False)
        prompt = f"{prompt}\n\nOPTIONS DE PRODUCTION:\n{options_json}"
        raw_result = client.generate(prompt, transcript, model)
        result = validate_motion_result(_parse_json_response(raw_result))
        result["source"] = {
            "title": title,
            "url": url,
            "reference_type": options.reference_type,
        }
        ensure_dir(output_path.parent)
        output_path.write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return output_path, model.model


def _parse_json_response(response: str) -> dict[str, Any]:
    cleaned = response.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", cleaned, flags=re.DOTALL)
    if fenced:
        cleaned = fenced.group(1)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Gemini returned invalid Motion JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        raise ValueError("Gemini Motion response must be a JSON object.")
    return parsed
