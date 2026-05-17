from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from src.paths import ensure_dir, safe_slug


def extract_pdf_with_marker(pdf_path: Path, cache_dir: Path) -> Path:
    if shutil.which("marker_single") is None:
        raise RuntimeError("Marker CLI not found. Install marker-pdf separately.")
    output_dir = ensure_dir(cache_dir / safe_slug(pdf_path.stem, "pdf"))
    subprocess.run(
        ["marker_single", str(pdf_path), "--output_dir", str(output_dir)],
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
        raise RuntimeError("Marker did not produce a Markdown file.")
    return candidates[0]
