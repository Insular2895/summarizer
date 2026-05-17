from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

from src.paths import project_path


@dataclass(frozen=True)
class ModelConfig:
    name: str
    model: str
    max_input_tokens: int
    max_output_tokens: int
    temperature: float


def load_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise ValueError(f"Invalid YAML object in {path}")
    return data


def load_settings() -> dict[str, Any]:
    load_dotenv(project_path(".env"))
    return load_yaml(project_path("config", "settings.yaml"))


def load_models() -> dict[str, ModelConfig]:
    raw = load_yaml(project_path("config", "models.yaml")).get("models", {})
    models: dict[str, ModelConfig] = {}
    for name, value in raw.items():
        models[name] = ModelConfig(
            name=name,
            model=str(value["model"]),
            max_input_tokens=int(value["max_input_tokens"]),
            max_output_tokens=int(value["max_output_tokens"]),
            temperature=float(value["temperature"]),
        )
    return models
