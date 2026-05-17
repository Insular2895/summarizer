from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from src.paths import ensure_dir, safe_slug


def extract_pdf_with_mineru(pdf_path: Path, cache_dir: Path) -> Path:
    if shutil.which("mineru") is None:
        raise RuntimeError("MinerU CLI not found. Install it separately or use --engine marker.")
    output_dir = ensure_dir(cache_dir / safe_slug(pdf_path.stem, "pdf"))
    subprocess.run(
        ["mineru", "-p", str(pdf_path), "-o", str(output_dir)],
        check=True,
        capture_output=True,
        text=True,
    )
    return _find_markdown(output_dir)


def _find_markdown(output_dir: Path) -> Path:
    candidates = sorted(
        output_dir.rglob("*.md"), key=lambda path: path.stat().st_size, reverse=True
    )
    if not candidates:
        raise RuntimeError("MinerU did not produce a Markdown file.")
    return candidates[0]
