from __future__ import annotations

import base64
import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from src.config import ModelConfig
from src.llm.base import LLMError, LLMInvalidJsonError
from src.llm.openai_compatible_client import OpenAICompatibleClient
from src.paths import project_path


class AnthropicClient(OpenAICompatibleClient):
    """Anthropic Messages API adapter, kept dependency-free like the generic adapter."""

    def __init__(self) -> None:
        load_dotenv(project_path(".env"))
        self.api_key = os.getenv("LLM_API_KEY") or os.getenv("ANTHROPIC_API_KEY", "")
        self.base_url = os.getenv("LLM_BASE_URL", "https://api.anthropic.com/v1").rstrip("/")
        self.timeout = int(os.getenv("LLM_TIMEOUT_SECONDS", "120"))
        if not self.api_key:
            raise LLMError("LLM_API_KEY or ANTHROPIC_API_KEY is required for Anthropic.")

    def _request(self, payload: dict[str, Any], model_config: ModelConfig) -> dict[str, Any]:
        payload["model"] = model_config.model
        return self._anthropic_request(payload)

    def generate(self, prompt: str, content: str, model_config: ModelConfig) -> str:
        response = self._request(
            {
                "max_tokens": model_config.max_output_tokens,
                "temperature": model_config.temperature,
                "messages": [{"role": "user", "content": f"{prompt}\n\n{content}"}],
            },
            model_config,
        )
        return _extract_anthropic_text(response)

    def generate_multimodal_json(
        self,
        prompt: str,
        content: str,
        image_paths: list[Path],
        model_config: ModelConfig,
    ) -> dict[str, Any]:
        parts: list[dict[str, Any]] = [{"type": "text", "text": f"{prompt}\n\n{content}"}]
        for path in image_paths:
            parts.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": base64.b64encode(path.read_bytes()).decode("ascii"),
                    },
                }
            )
        response = self._request(
            {
                "max_tokens": model_config.max_output_tokens,
                "temperature": model_config.temperature,
                "messages": [{"role": "user", "content": parts}],
            },
            model_config,
        )
        text = _extract_anthropic_text(response)
        try:
            value = json.loads(text.removeprefix("```json").removesuffix("```").strip())
        except json.JSONDecodeError as exc:
            raise LLMInvalidJsonError(f"Anthropic returned invalid JSON: {exc}") from exc
        if not isinstance(value, dict):
            raise LLMInvalidJsonError("Anthropic JSON response must be an object.")
        return value

    def _anthropic_request(self, payload: dict[str, Any]) -> dict[str, Any]:
        import urllib.error
        import urllib.request

        request = urllib.request.Request(
            f"{self.base_url}/messages",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                raw = json.loads(response.read().decode("utf-8"))
        except (
            urllib.error.URLError,
            urllib.error.HTTPError,
            TimeoutError,
            json.JSONDecodeError,
        ) as exc:
            raise LLMError(f"Anthropic request failed: {exc}") from exc
        if not isinstance(raw, dict):
            raise LLMError("Anthropic returned an invalid response.")
        return raw


def _extract_anthropic_text(response: dict[str, Any]) -> str:
    try:
        text = "".join(
            str(block["text"]) for block in response["content"] if block.get("type") == "text"
        )
    except (KeyError, TypeError) as exc:
        raise LLMError(f"Invalid Anthropic response: {response}") from exc
    if not text.strip():
        raise LLMError("Anthropic returned an empty response.")
    return text.strip()
