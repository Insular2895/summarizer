from __future__ import annotations

import os
import shlex
import shutil
import subprocess
import sys
from importlib.util import find_spec
from pathlib import Path

from src.extractors.pdf_text import write_pdf_text_as_markdown
from src.paths import ensure_dir, safe_slug


def extract_pdf_with_ocrmypdf(
    pdf_path: Path,
    cache_dir: Path,
    max_pages: int | None = None,
    language: str = "eng",
) -> Path:
    command_prefix = _ocrmypdf_command_prefix()
    if command_prefix is None:
        raise RuntimeError("OCRmyPDF not found. Install it separately or use --engine mineru.")

    slug = safe_slug(pdf_path.stem, "pdf")
    output_dir = ensure_dir(cache_dir / slug / "ocrmypdf")
    searchable_pdf_path = output_dir / f"{slug}.ocr.pdf"
    markdown_path = output_dir / f"{slug}.md"
    command = [
        *command_prefix,
        "--output-type",
        "pdf",
        "--optimize",
        "0",
        "--rotate-pages",
        "--deskew",
        "--skip-text",
        "--jobs",
        "2",
        "-l",
        language,
    ]
    if max_pages is not None:
        command.extend(["--pages", f"1-{max_pages}"])
    command.extend([str(pdf_path), str(searchable_pdf_path)])

    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        details = "\n".join(part for part in [exc.stderr, exc.stdout] if part).strip()
        excerpt = details[-2000:] if details else str(exc)
        raise RuntimeError(f"OCRmyPDF failed: {excerpt}") from exc

    return write_pdf_text_as_markdown(searchable_pdf_path, markdown_path, max_pages=max_pages)


def _ocrmypdf_command_prefix() -> list[str] | None:
    custom_command = os.getenv("OCRMYPDF_COMMAND")
    if custom_command:
        return shlex.split(custom_command)
    if find_spec("ocrmypdf") is not None:
        return [sys.executable, "-m", "ocrmypdf"]
    executable = shutil.which("ocrmypdf")
    if executable is not None:
        return [executable]
    return None
