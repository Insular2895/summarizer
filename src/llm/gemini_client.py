from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from google import genai
from google.genai import types

from src.config import ModelConfig
from src.converters.token_counter import count_tokens
from src.llm.base import LLMError, LLMInvalidJsonError, LLMQuotaError, effective_model_config
from src.llm.rate_limiter import RateLimiter
from src.llm.usage import record_gemini_usage
from src.paths import project_path


class GeminiError(LLMError):
    pass


class GeminiInvalidJsonError(LLMInvalidJsonError, GeminiError):
    """Gemini returned media successfully, but its structured output is unusable."""


class GeminiQuotaError(LLMQuotaError, GeminiError):
    """Gemini cannot continue because the current project quota is exhausted."""


@dataclass
class GeminiClient:
    api_key: str | None = None
    timeout_seconds: int = 120
    retries: int = 2
    rate_limiter: RateLimiter | None = None

    def __post_init__(self) -> None:
        load_dotenv(project_path(".env"))
        key = self.api_key or os.getenv("GEMINI_API_KEY")
        if not key:
            raise GeminiError("GEMINI_API_KEY is missing. Create a local .env from .env.example.")
        self._client = genai.Client(api_key=key)
        self.rate_limiter = self.rate_limiter or RateLimiter()

    def generate(self, prompt: str, content: str, model_config: ModelConfig) -> str:
        model_config = effective_model_config(model_config)
        request = f"{prompt.strip()}\n\n---\n\nCONTENU A ANALYSER :\n\n{content.strip()}"
        input_tokens = count_tokens(request)
        last_error: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                assert self.rate_limiter is not None
                self.rate_limiter.wait()
                response = self._client.models.generate_content(
                    model=model_config.model,
                    contents=request,
                    config=types.GenerateContentConfig(
                        temperature=model_config.temperature,
                        max_output_tokens=model_config.max_output_tokens,
                    ),
                )
                text = (response.text or "").strip()
                if not text:
                    raise GeminiError("Gemini returned an empty response.")
                _record_usage_safely(
                    model=model_config.model,
                    operation=model_config.name,
                    input_tokens=input_tokens,
                    output_tokens=count_tokens(text),
                    max_output_tokens=model_config.max_output_tokens,
                    status="success",
                )
                return text
            except Exception as exc:  # pragma: no cover - network/API behavior
                last_error = exc
                if _is_quota_exhaustion(exc) or attempt >= self.retries:
                    break
                time.sleep(2**attempt)
        _record_usage_safely(
            model=model_config.model,
            operation=model_config.name,
            input_tokens=input_tokens,
            output_tokens=0,
            max_output_tokens=model_config.max_output_tokens,
            status="failed",
            error=str(last_error),
        )
        error_type = GeminiQuotaError if _is_quota_exhaustion(last_error) else GeminiError
        raise error_type(f"Gemini request failed: {last_error}") from last_error

    def generate_multimodal_json(
        self,
        prompt: str,
        content: str,
        image_paths: list[Path],
        model_config: ModelConfig,
    ) -> dict[str, Any]:
        model_config = effective_model_config(model_config)
        if not image_paths:
            raise GeminiError("At least one evidence image is required.")
        parts: list[types.Part] = [
            types.Part.from_text(text=f"{prompt.strip()}\n\n---\n\n{content.strip()}")
        ]
        image_bytes = 0
        for path in image_paths:
            if path.suffix.lower() != ".png":
                raise GeminiError(f"Only PNG evidence is accepted: {path}")
            payload = path.read_bytes()
            image_bytes += len(payload)
            parts.append(types.Part.from_bytes(data=payload, mime_type="image/png"))
        if image_bytes > 30 * 1024 * 1024:
            raise GeminiError("Evidence packet images exceed the 30 MB request budget.")

        input_tokens = count_tokens(prompt + content) + image_bytes // 1024
        last_error: Exception | None = None
        response_text: str | None = None
        for attempt in range(self.retries + 1):
            try:
                assert self.rate_limiter is not None
                self.rate_limiter.wait()
                response = self._client.models.generate_content(
                    model=model_config.model,
                    contents=[types.Content(role="user", parts=parts)],
                    config=types.GenerateContentConfig(
                        temperature=model_config.temperature,
                        max_output_tokens=model_config.max_output_tokens,
                        response_mime_type="application/json",
                    ),
                )
                response_text = (response.text or "").strip()
                if not response_text:
                    raise GeminiError("Gemini returned an empty response.")
                break
            except Exception as exc:  # pragma: no cover - network/API behavior
                last_error = exc
                if _is_quota_exhaustion(exc) or attempt >= self.retries:
                    break
                time.sleep(2**attempt)
        if response_text is None:
            _record_usage_safely(
                model=model_config.model,
                operation=model_config.name,
                input_tokens=input_tokens,
                output_tokens=0,
                max_output_tokens=model_config.max_output_tokens,
                status="failed",
                error=str(last_error),
            )
            error_type = GeminiQuotaError if _is_quota_exhaustion(last_error) else GeminiError
            raise error_type(f"Gemini multimodal request failed: {last_error}") from last_error
        try:
            value = _parse_json_object(response_text)
        except (GeminiError, json.JSONDecodeError) as exc:
            _record_usage_safely(
                model=model_config.model,
                operation=model_config.name,
                input_tokens=input_tokens,
                output_tokens=count_tokens(response_text),
                max_output_tokens=model_config.max_output_tokens,
                status="failed",
                error=f"invalid_json: {exc}",
            )
            raise GeminiInvalidJsonError(f"Gemini returned invalid JSON: {exc}") from exc
        _record_usage_safely(
            model=model_config.model,
            operation=model_config.name,
            input_tokens=input_tokens,
            output_tokens=count_tokens(response_text),
            max_output_tokens=model_config.max_output_tokens,
            status="success",
        )
        return value


def _record_usage_safely(
    model: str,
    operation: str,
    input_tokens: int,
    output_tokens: int,
    max_output_tokens: int,
    status: str,
    error: str | None = None,
) -> None:
    try:
        record_gemini_usage(
            model=model,
            operation=operation,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            max_output_tokens=max_output_tokens,
            status=status,
            error=error,
        )
    except Exception:
        return


def _parse_json_object(text: str) -> dict[str, Any]:
    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = candidate.removeprefix("```json").removeprefix("```")
        candidate = candidate.removesuffix("```").strip()
    value = json.loads(candidate)
    if not isinstance(value, dict):
        raise GeminiError("Gemini JSON response must be an object.")
    return value


def _is_quota_exhaustion(error: object) -> bool:
    """Recognize hard quota failures so callers do not waste retries or requests."""
    message = str(error).lower()
    return (
        "resource_exhausted" in message
        or "quota exceeded" in message
        or "quota metric" in message
        or "free_tier_requests" in message
    )
