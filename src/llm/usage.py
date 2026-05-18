from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from src.config import load_settings
from src.paths import ensure_dir, project_path


@dataclass(frozen=True)
class GeminiUsageEvent:
    timestamp: str
    model: str
    operation: str
    input_tokens: int
    output_tokens: int
    max_output_tokens: int
    status: str
    estimated_cost_usd: float | None = None
    error: str | None = None


@dataclass(frozen=True)
class GeminiUsageSummary:
    request_count: int
    successful_requests: int
    failed_requests: int
    input_tokens: int
    output_tokens: int
    estimated_cost_usd: float | None
    budget_usd: float | None
    budget_remaining_usd: float | None
    by_model: dict[str, dict[str, int | float | None]]


def record_gemini_usage(
    model: str,
    operation: str,
    input_tokens: int,
    output_tokens: int,
    max_output_tokens: int,
    status: str,
    error: str | None = None,
    log_path: Path | None = None,
) -> GeminiUsageEvent:
    estimated_cost = estimate_cost_usd(model, input_tokens, output_tokens)
    event = GeminiUsageEvent(
        timestamp=datetime.now(UTC).isoformat(),
        model=model,
        operation=operation,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        max_output_tokens=max_output_tokens,
        status=status,
        estimated_cost_usd=estimated_cost,
        error=error,
    )
    target = log_path or usage_log_path()
    ensure_dir(target.parent)
    with target.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(asdict(event), ensure_ascii=False) + "\n")
    return event


def read_gemini_usage(log_path: Path | None = None) -> list[GeminiUsageEvent]:
    target = log_path or usage_log_path()
    if not target.exists():
        return []
    events: list[GeminiUsageEvent] = []
    for line in target.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        raw = json.loads(line)
        events.append(
            GeminiUsageEvent(
                timestamp=str(raw["timestamp"]),
                model=str(raw["model"]),
                operation=str(raw.get("operation", "generate")),
                input_tokens=int(raw.get("input_tokens", 0)),
                output_tokens=int(raw.get("output_tokens", 0)),
                max_output_tokens=int(raw.get("max_output_tokens", 0)),
                status=str(raw.get("status", "unknown")),
                estimated_cost_usd=_optional_float(raw.get("estimated_cost_usd")),
                error=raw.get("error"),
            )
        )
    return events


def summarize_gemini_usage(log_path: Path | None = None) -> GeminiUsageSummary:
    events = read_gemini_usage(log_path)
    total_costs = [
        event.estimated_cost_usd for event in events if event.estimated_cost_usd is not None
    ]
    by_model: dict[str, dict[str, int | float | None]] = {}
    for event in events:
        current = by_model.setdefault(
            event.model,
            {
                "requests": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "estimated_cost_usd": 0.0 if event.estimated_cost_usd is not None else None,
            },
        )
        current["requests"] = int(current["requests"] or 0) + 1
        current["input_tokens"] = int(current["input_tokens"] or 0) + event.input_tokens
        current["output_tokens"] = int(current["output_tokens"] or 0) + event.output_tokens
        if event.estimated_cost_usd is not None:
            current["estimated_cost_usd"] = (
                float(current["estimated_cost_usd"] or 0.0) + event.estimated_cost_usd
            )

    total_cost = sum(total_costs) if total_costs else None
    budget = _monthly_budget_usd()
    remaining = None
    if budget is not None and total_cost is not None:
        remaining = round(budget - total_cost, 8)
    return GeminiUsageSummary(
        request_count=len(events),
        successful_requests=sum(1 for event in events if event.status == "success"),
        failed_requests=sum(1 for event in events if event.status == "failed"),
        input_tokens=sum(event.input_tokens for event in events),
        output_tokens=sum(event.output_tokens for event in events),
        estimated_cost_usd=total_cost,
        budget_usd=budget,
        budget_remaining_usd=remaining,
        by_model=by_model,
    )


def estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float | None:
    price = _model_price(model)
    if price is None:
        return None
    input_cost = (input_tokens / 1_000_000) * price["input_per_1m"]
    output_cost = (output_tokens / 1_000_000) * price["output_per_1m"]
    return round(input_cost + output_cost, 8)


def usage_log_path() -> Path:
    settings = load_settings().get("usage", {})
    raw_path = settings.get("log_path", "cache/jobs/gemini_usage.jsonl")
    return project_path(str(raw_path))


def _model_price(model: str) -> dict[str, float] | None:
    settings = load_settings().get("usage", {})
    prices = settings.get("model_prices_per_1m", {})
    if not isinstance(prices, dict):
        return None
    raw_price = prices.get(model)
    if not isinstance(raw_price, dict):
        return None
    try:
        return {
            "input_per_1m": float(raw_price["input"]),
            "output_per_1m": float(raw_price["output"]),
        }
    except (KeyError, TypeError, ValueError):
        return None


def _monthly_budget_usd() -> float | None:
    settings = load_settings().get("usage", {})
    value = settings.get("monthly_budget_usd")
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    try:
        budget = float(value)
    except (TypeError, ValueError):
        return None
    return budget if budget > 0 else None


def _optional_float(value: Any) -> float | None:
    if value is None:
        return None
    return float(value)
