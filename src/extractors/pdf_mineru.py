from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from src.paths import ensure_dir, safe_slug


def extract_pdf_with_mineru(
    pdf_path: Path,
    cache_dir: Path,
    max_pages: int | None = None,
    backend: str = "pipeline",
    method: str = "ocr",
) -> Path:
    if shutil.which("mineru") is None:
        raise RuntimeError("MinerU CLI not found. Install it separately or use --engine marker.")
    output_dir = ensure_dir(cache_dir / safe_slug(pdf_path.stem, "pdf"))
    command = [
        "mineru",
        "-p",
        str(pdf_path),
        "-o",
        str(output_dir),
        "-b",
        backend,
        "-m",
        method,
    ]
    if max_pages is not None:
        command.extend(["-s", "0", "-e", str(max_pages - 1)])
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        details = "\n".join(part for part in [exc.stderr, exc.stdout] if part).strip()
        excerpt = details[-2000:] if details else str(exc)
        raise RuntimeError(
            f"MinerU failed with backend={backend}, method={method}: {excerpt}"
        ) from exc
    return _find_markdown(output_dir)


def _find_markdown(output_dir: Path) -> Path:
    candidates = sorted(
        output_dir.rglob("*.md"), key=lambda path: path.stat().st_size, reverse=True
    )
    if not candidates:
        raise RuntimeError("MinerU did not produce a Markdown file.")
    return candidates[0]
