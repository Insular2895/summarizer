from __future__ import annotations

from types import SimpleNamespace

from src.config import ModelConfig
from src.llm import gemini_client
from src.llm.gemini_client import GeminiClient


class NoWaitLimiter:
    def wait(self) -> None:
        return


def test_backup_key_is_tried_after_primary_quota(monkeypatch) -> None:
    calls: list[str] = []

    class FakeModels:
        def __init__(self, key: str) -> None:
            self.key = key

        def generate_content(self, **_kwargs):  # type: ignore[no-untyped-def]
            calls.append(self.key)
            if self.key == "primary-key-value-for-tests":
                raise RuntimeError("RESOURCE_EXHAUSTED: quota exceeded")
            return SimpleNamespace(text="Résumé produit avec la clé de secours")

    monkeypatch.setattr(
        gemini_client.genai,
        "Client",
        lambda api_key: SimpleNamespace(models=FakeModels(api_key)),
    )
    monkeypatch.setattr(gemini_client, "_record_usage_safely", lambda **_kwargs: None)
    client = GeminiClient(
        api_key="primary-key-value-for-tests",
        backup_api_key="backup-key-value-for-tests",
        retries=0,
        rate_limiter=NoWaitLimiter(),  # type: ignore[arg-type]
    )

    result = client.generate(
        "Résume",
        "Contenu",
        ModelConfig("video_summary", "gemini-test", 1_000, 500, 0.2),
    )

    assert result == "Résumé produit avec la clé de secours"
    assert calls == ["primary-key-value-for-tests", "backup-key-value-for-tests"]
