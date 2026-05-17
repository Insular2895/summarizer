from __future__ import annotations

import os
import time
from dataclasses import dataclass

from google import genai
from google.genai import types

from src.config import ModelConfig
from src.llm.rate_limiter import RateLimiter


class GeminiError(RuntimeError):
    pass


@dataclass
class GeminiClient:
    api_key: str | None = None
    timeout_seconds: int = 120
    retries: int = 2
    rate_limiter: RateLimiter | None = None

    def __post_init__(self) -> None:
        key = self.api_key or os.getenv("GEMINI_API_KEY")
        if not key:
            raise GeminiError("GEMINI_API_KEY is missing. Create a local .env from .env.example.")
        self._client = genai.Client(api_key=key)
        self.rate_limiter = self.rate_limiter or RateLimiter()

    def generate(self, prompt: str, content: str, model_config: ModelConfig) -> str:
        request = f"{prompt.strip()}\n\n---\n\nCONTENU A ANALYSER :\n\n{content.strip()}"
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
                return text
            except Exception as exc:  # pragma: no cover - network/API behavior
                last_error = exc
                if attempt >= self.retries:
                    break
                time.sleep(2**attempt)
        raise GeminiError(f"Gemini request failed: {last_error}") from last_error
