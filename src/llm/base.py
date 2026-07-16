from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol

from src.config import ModelConfig


class LLMError(RuntimeError):
    """Base error shared by every configured AI provider."""


class LLMInvalidJsonError(LLMError):
    """The provider returned a response that is not valid JSON."""


class LLMQuotaError(LLMError):
    """The provider refused the request because of quota or rate limits."""


class LLMClient(Protocol):
    def generate(self, prompt: str, content: str, model_config: ModelConfig) -> str: ...

    def generate_multimodal_json(
        self,
        prompt: str,
        content: str,
        image_paths: list[Path],
        model_config: ModelConfig,
    ) -> dict[str, Any]: ...


def effective_model_config(model_config: ModelConfig) -> ModelConfig:
    """Allow a provider-specific model without editing the tracked YAML file."""
    import os

    override = os.getenv(f"LLM_MODEL_{model_config.name.upper()}")
    if not override:
        return model_config
    return ModelConfig(
        name=model_config.name,
        model=override,
        max_input_tokens=model_config.max_input_tokens,
        max_output_tokens=model_config.max_output_tokens,
        temperature=model_config.temperature,
    )
