from __future__ import annotations

import os
import re
import unicodedata
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def project_path(*parts: str) -> Path:
    return PROJECT_ROOT.joinpath(*parts)


def youtube_library_path() -> Path:
    load_dotenv(PROJECT_ROOT / ".env")
    configured = os.getenv("YOUTUBE_LIBRARY_DIR")
    return Path(configured).expanduser() if configured else project_path("library", "youtube")


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def safe_slug(value: str, fallback: str = "item", max_length: int = 80) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    slug = re.sub(r"-{2,}", "-", slug)
    if not slug:
        slug = fallback
    return slug[:max_length].strip("-") or fallback


def assert_inside(path: Path, root: Path) -> Path:
    resolved = path.resolve()
    root_resolved = root.resolve()
    if resolved != root_resolved and root_resolved not in resolved.parents:
        raise ValueError(f"Unsafe path outside {root_resolved}: {resolved}")
    return resolved
