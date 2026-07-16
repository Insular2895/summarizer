from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from src.config import ModelConfig
from src.llm.base import LLMClient, LLMInvalidJsonError
from src.pdf_evidence.core import DetectedElement, read_json, write_json
from src.pdf_evidence.validation import validate_visual_review_response


class GeminiVisualReviewer:
    def __init__(
        self,
        client: LLMClient,
        model_config: ModelConfig,
        prompt_path: Path,
    ) -> None:
        self.client = client
        self.model_config = model_config
        self.prompt = prompt_path.read_text(encoding="utf-8")

    def review(self, element: DetectedElement, packet: Path) -> dict[str, Any]:
        metadata = read_json(packet / "metadata.json")
        extraction = read_json(packet / "extraction_candidate.json")
        request = {
            "metadata": metadata,
            "extraction_candidate": extraction,
            "required_element_id": element.element_id,
            "required_output": "strict JSON object, no Markdown",
        }
        image_paths = [
            packet / "full_page_original.png",
            packet / "element_crop_normalized.png",
        ]
        repair_attempted = False
        first_invalid_response: dict[str, Any] | None = None
        try:
            value = self.client.generate_multimodal_json(
                self.prompt,
                json.dumps(request, ensure_ascii=False, indent=2),
                image_paths,
                self.model_config,
            )
            validate_visual_review_response(value, element.element_id)
        except (LLMInvalidJsonError, ValueError, json.JSONDecodeError) as first_error:
            repair_attempted = True
            if "value" in locals() and isinstance(value, dict):
                first_invalid_response = value
                write_json(packet / "gemini_review_invalid_attempt.json", value)
            repair_request = (
                "La réponse précédente était invalide. Recommence depuis les images et retourne "
                "uniquement le JSON strict demandé. Erreur de validation : " + str(first_error)
            )
            value = self.client.generate_multimodal_json(
                self.prompt,
                repair_request + "\n\n" + json.dumps(request, ensure_ascii=False),
                image_paths,
                self.model_config,
            )
            validate_visual_review_response(value, element.element_id)
        write_json(packet / "gemini_review.json", value)
        write_json(
            packet / "gemini_review_metadata.json",
            {
                "repair_attempted": repair_attempted,
                "invalid_attempt_preserved": first_invalid_response is not None,
            },
        )
        return value
