from __future__ import annotations

import base64
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from src.config import ModelConfig
from src.llm.base import LLMError, LLMInvalidJsonError, LLMQuotaError, effective_model_config
from src.paths import project_path


class OpenAICompatibleClient:
    """Small dependency-free client for OpenAI-compatible chat APIs."""

    def __init__(self) -> None:
        load_dotenv(project_path(".env"))
        provider = os.getenv("LLM_PROVIDER", "openai_compatible").strip().lower()
        provider_keys = {
            "mistral": "MISTRAL_API_KEY",
            "openrouter": "OPENROUTER_API_KEY",
        }
        self.api_key = (
            os.getenv("LLM_API_KEY")
            or os.getenv(provider_keys.get(provider, ""), "")
            or os.getenv("OPENAI_API_KEY", "")
        )
        default_urls = {
            "openai": "https://api.openai.com/v1",
            "openai_compatible": "https://api.openai.com/v1",
            "mistral": "https://api.mistral.ai/v1",
            "openrouter": "https://openrouter.ai/api/v1",
            "ollama": "http://localhost:11434/v1",
            "lm_studio": "http://localhost:1234/v1",
            "vllm": "http://localhost:8000/v1",
        }
        self.base_url = os.getenv("LLM_BASE_URL", "").strip() or default_urls.get(
            provider, "https://api.openai.com/v1"
        )
        self.base_url = self.base_url.rstrip("/")
        self.timeout = int(os.getenv("LLM_TIMEOUT_SECONDS", "120"))
        if "api.openai.com" in self.base_url and not self.api_key:
            raise LLMError("LLM_API_KEY or OPENAI_API_KEY is required for OpenAI.")

    def generate(self, prompt: str, content: str, model_config: ModelConfig) -> str:
        model_config = effective_model_config(model_config)
        request = f"{prompt.strip()}\n\n---\n\nCONTENU A ANALYSER :\n\n{content.strip()}"
        payload = {
            "model": model_config.model,
            "messages": [{"role": "user", "content": request}],
            "temperature": model_config.temperature,
            "max_tokens": model_config.max_output_tokens,
        }
        response = self._request(payload, model_config)
        return _extract_openai_text(response)

    def generate_multimodal_json(
        self,
        prompt: str,
        content: str,
        image_paths: list[Path],
        model_config: ModelConfig,
    ) -> dict[str, Any]:
        model_config = effective_model_config(model_config)
        parts: list[dict[str, Any]] = [
            {"type": "text", "text": f"{prompt.strip()}\n\n{content.strip()}"}
        ]
        for path in image_paths:
            encoded = base64.b64encode(path.read_bytes()).decode("ascii")
            parts.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{encoded}"},
                }
            )
        payload = {
            "model": model_config.model,
            "messages": [{"role": "user", "content": parts}],
            "temperature": model_config.temperature,
            "max_tokens": model_config.max_output_tokens,
            "response_format": {"type": "json_object"},
        }
        response = self._request(payload, model_config)
        return _parse_json(_extract_openai_text(response))

    def _request(self, payload: dict[str, Any], model_config: ModelConfig) -> dict[str, Any]:
        body = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        request = urllib.request.Request(
            f"{self.base_url}/chat/completions", data=body, headers=headers, method="POST"
        )
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    raw = json.loads(response.read().decode("utf-8"))
                if not isinstance(raw, dict):
                    raise LLMError("OpenAI-compatible provider returned an invalid response.")
                return raw
            except urllib.error.HTTPError as exc:
                message = exc.read().decode("utf-8", errors="replace")
                last_error = exc
                if exc.code in {401, 403}:
                    raise LLMError(f"AI provider authentication failed: {message}") from exc
                if exc.code not in {408, 409, 429} and exc.code < 500:
                    raise LLMError(f"AI provider request failed: {message}") from exc
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                last_error = exc
            if attempt < 2:
                time.sleep(2**attempt)
        if isinstance(last_error, urllib.error.HTTPError) and last_error.code == 429:
            raise LLMQuotaError(
                f"AI provider quota or rate limit reached: {last_error}"
            ) from last_error
        raise LLMError(f"AI provider request failed: {last_error}") from last_error


def _extract_openai_text(response: dict[str, Any]) -> str:
    try:
        content = response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMError(f"Invalid OpenAI-compatible response: {response}") from exc
    if isinstance(content, list):
        content = "".join(str(part.get("text", "")) for part in content if isinstance(part, dict))
    text = str(content or "").strip()
    if not text:
        raise LLMError("AI provider returned an empty response.")
    return text


def _parse_json(text: str) -> dict[str, Any]:
    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = candidate.removeprefix("```json").removeprefix("```")
        candidate = candidate.removesuffix("```").strip()
    try:
        value = json.loads(candidate)
    except json.JSONDecodeError as exc:
        raise LLMInvalidJsonError(f"AI provider returned invalid JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise LLMInvalidJsonError("AI provider JSON response must be an object.")
    return value
