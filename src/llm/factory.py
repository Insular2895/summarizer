from __future__ import annotations

import os

from dotenv import load_dotenv

from src.llm.anthropic_client import AnthropicClient
from src.llm.base import LLMClient, LLMError, effective_model_config
from src.llm.gemini_client import GeminiClient
from src.llm.openai_compatible_client import OpenAICompatibleClient
from src.paths import project_path


def create_llm_client() -> LLMClient:
    load_dotenv(project_path(".env"))
    provider = os.getenv("LLM_PROVIDER", "gemini").strip().lower()
    if provider == "gemini":
        return GeminiClient()
    if provider in {
        "openai",
        "openai_compatible",
        "mistral",
        "openrouter",
        "ollama",
        "lm_studio",
        "vllm",
    }:
        return OpenAICompatibleClient()
    if provider == "anthropic":
        return AnthropicClient()
    raise LLMError(
        f"Unknown LLM_PROVIDER={provider!r}. Use gemini, openai_compatible or anthropic."
    )


__all__ = ["create_llm_client", "effective_model_config"]
