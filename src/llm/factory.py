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
    provider = os.getenv("LLM_PROVIDER", "auto").strip().lower()
    if provider in {"", "auto"}:
        provider = _detect_provider()
        # Downstream adapters use this resolved value for provider-specific defaults.
        os.environ["LLM_PROVIDER"] = provider
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


def _detect_provider() -> str:
    """Select the first configured provider; empty keys never activate a provider."""
    if _configured("GEMINI_API_KEY"):
        return "gemini"
    if _configured("ANTHROPIC_API_KEY"):
        return "anthropic"
    if _configured("MISTRAL_API_KEY"):
        return "mistral"
    if _configured("OPENROUTER_API_KEY"):
        return "openrouter"
    if _configured("OPENAI_API_KEY") or _configured("LLM_API_KEY"):
        return "openai_compatible"
    return "gemini"


def _configured(name: str) -> bool:
    value = os.getenv(name, "").strip().lower()
    return bool(value) and value not in {
        "your_api_key_here",
        "your_provider_api_key",
        "ta_cle_api_gemini",
        "ta_cle_api",
        "ta_cle_anthropic",
    }


__all__ = ["create_llm_client", "effective_model_config"]
