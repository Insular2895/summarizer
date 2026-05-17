from __future__ import annotations

from pathlib import Path

from src.paths import ensure_dir, safe_slug


def extract_pdf_with_pypdf(pdf_path: Path, cache_dir: Path, max_pages: int | None = None) -> Path:
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise RuntimeError("pypdf is not installed. Run: pip install pypdf") from exc

    reader = PdfReader(str(pdf_path))
    parts: list[str] = []
    pages = reader.pages[:max_pages] if max_pages is not None else reader.pages
    for index, page in enumerate(pages, start=1):
        text = page.extract_text() or ""
        if text.strip():
            parts.append(f"# Page {index}\n\n{text.strip()}")
    if not parts:
        raise RuntimeError("pypdf did not extract any text from this PDF.")

    output_dir = ensure_dir(cache_dir / safe_slug(pdf_path.stem, "pdf"))
    output_path = output_dir / f"{safe_slug(pdf_path.stem, 'pdf')}.md"
    output_path.write_text("\n\n".join(parts).strip() + "\n", encoding="utf-8")
    return output_path
