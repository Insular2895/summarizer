from src.config import ModelConfig
from src.llm.base import effective_model_config
from src.llm.factory import create_llm_client


def test_provider_specific_model_override(monkeypatch) -> None:
    config = ModelConfig("pdf_deep", "gemini-default", 1000, 500, 0.2)
    monkeypatch.setenv("LLM_MODEL_PDF_DEEP", "custom-model")

    resolved = effective_model_config(config)

    assert resolved.model == "custom-model"
    assert resolved.max_input_tokens == 1000


def test_factory_selects_openai_compatible_provider(monkeypatch) -> None:
    sentinel = object()
    monkeypatch.setenv("LLM_PROVIDER", "openai_compatible")
    monkeypatch.setattr("src.llm.factory.OpenAICompatibleClient", lambda: sentinel)

    assert create_llm_client() is sentinel


def test_factory_selects_anthropic_provider(monkeypatch) -> None:
    sentinel = object()
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setattr("src.llm.factory.AnthropicClient", lambda: sentinel)

    assert create_llm_client() is sentinel
