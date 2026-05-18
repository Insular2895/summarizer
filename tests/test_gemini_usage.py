from pathlib import Path

from src.llm.usage import (
    estimate_cost_usd,
    record_gemini_usage,
    summarize_gemini_usage,
)


def test_record_and_summarize_usage(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(
        "src.llm.usage.load_settings",
        lambda: {
            "usage": {
                "monthly_budget_usd": 2.0,
                "model_prices_per_1m": {
                    "gemini-test": {
                        "input": 1.0,
                        "output": 3.0,
                    }
                },
            }
        },
    )
    log_path = tmp_path / "usage.jsonl"

    record_gemini_usage(
        model="gemini-test",
        operation="video_simple",
        input_tokens=1000,
        output_tokens=500,
        max_output_tokens=8000,
        status="success",
        log_path=log_path,
    )

    summary = summarize_gemini_usage(log_path)

    assert summary.request_count == 1
    assert summary.successful_requests == 1
    assert summary.failed_requests == 0
    assert summary.input_tokens == 1000
    assert summary.output_tokens == 500
    assert summary.estimated_cost_usd == 0.0025
    assert summary.budget_usd == 2.0
    assert summary.budget_remaining_usd == 1.9975
    assert summary.by_model["gemini-test"]["requests"] == 1


def test_estimate_cost_returns_none_without_config(monkeypatch) -> None:
    monkeypatch.setattr("src.llm.usage.load_settings", lambda: {"usage": {}})

    assert estimate_cost_usd("gemini-test", 1000, 1000) is None
