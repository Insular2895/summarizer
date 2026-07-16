from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from src.pdf_evidence.core import BoundingBox


class PdfRenderError(RuntimeError):
    pass


@dataclass(frozen=True)
class PageLayout:
    width: float
    height: float
    rotation: int
    blocks: list[dict[str, Any]]
    text_source: str = "native_pdf_text"
    text_confidence: float | None = 1.0
    alerts: tuple[str, ...] = ()
    skew_degrees: float = 0.0


class PdfRenderer:
    def __init__(self, pdf_path: Path) -> None:
        try:
            import fitz
        except ImportError as exc:  # pragma: no cover - environment-dependent
            raise PdfRenderError(
                "PyMuPDF is required for evidence rendering. "
                "Install it with: pip install -r requirements-pdf.txt"
            ) from exc
        self._fitz = fitz
        self.pdf_path = pdf_path
        self._document = fitz.open(str(pdf_path))

    def close(self) -> None:
        self._document.close()

    def __enter__(self) -> PdfRenderer:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    @property
    def page_count(self) -> int:
        return len(self._document)

    def layout(self, page_index: int) -> PageLayout:
        page = self._document.load_page(page_index)
        blocks: list[dict[str, Any]] = []
        for block in page.get_text("blocks"):
            x0, y0, x1, y1, text, block_number, block_type = block[:7]
            blocks.append(
                {
                    "bbox": [float(x0), float(y0), float(x1), float(y1)],
                    "text": str(text),
                    "block_number": int(block_number),
                    "block_type": int(block_type),
                }
            )
        return PageLayout(
            width=float(page.rect.width),
            height=float(page.rect.height),
            rotation=int(page.rotation),
            blocks=blocks,
            text_source="native_pdf_text",
            text_confidence=1.0,
            alerts=(),
            skew_degrees=0.0,
        )

    def native_text(self, page_index: int) -> str:
        return str(self._document.load_page(page_index).get_text("text"))

    def render(
        self,
        page_index: int,
        output_path: Path,
        dpi: int = 300,
        bbox: BoundingBox | None = None,
        extra_rotation: int = 0,
    ) -> Path:
        if dpi < 72 or dpi > 600:
            raise ValueError("dpi must be between 72 and 600")
        if extra_rotation not in {0, 90, 180, 270}:
            raise ValueError("extra_rotation must be 0, 90, 180 or 270")
        page = self._document.load_page(page_index)
        matrix = self._fitz.Matrix(dpi / 72, dpi / 72)
        if extra_rotation:
            matrix = matrix.prerotate(extra_rotation)
        clip = None
        if bbox is not None:
            clip = self._fitz.Rect(bbox.x0, bbox.y0, bbox.x1, bbox.y1)
            clip = clip & page.rect
            if clip.is_empty:
                raise PdfRenderError(f"Empty crop on PDF page {page_index + 1}: {bbox}")
        pixmap = page.get_pixmap(matrix=matrix, clip=clip, alpha=False)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        pixmap.save(str(output_path))
        return output_path
