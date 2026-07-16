from __future__ import annotations

import subprocess
import sys
from contextlib import suppress
from dataclasses import asdict
from pathlib import Path

from src.pdf_evidence.core import (
    BoundingBox,
    DetectedElement,
    DocumentManifest,
    ElementType,
    ReviewStatus,
    write_json,
)
from src.pdf_evidence.detect import detect_elements, page_identity
from src.pdf_evidence.evidence import build_evidence_packet
from src.pdf_evidence.ocr import LocalOcrError, ocr_page, should_run_ocr
from src.pdf_evidence.render import PdfRenderer


def inspect_pdf_element(
    pdf_path: Path,
    pdf_page_number: int,
    output_root: Path,
    *,
    element_id: str | None = None,
    bbox: BoundingBox | None = None,
    dpi: int = 450,
    include_context: bool = True,
    open_images: bool = False,
    ocr_language: str = "eng",
) -> Path:
    manifest = DocumentManifest.from_pdf(pdf_path)
    page_index = pdf_page_number - 1
    if page_index < 0 or page_index >= manifest.page_count:
        raise ValueError(
            f"PDF page number must be between 1 and {manifest.page_count}; got {pdf_page_number}"
        )
    with PdfRenderer(pdf_path) as renderer:
        layout = renderer.layout(page_index)
        if should_run_ocr(layout):
            with suppress(LocalOcrError):
                layout = ocr_page(
                    renderer,
                    page_index,
                    dpi=min(dpi, 350),
                    language=ocr_language,
                ).layout
        elements = detect_elements(manifest.document_id, page_index, layout)
        if not elements and bbox is not None:
            identity = page_identity(
                manifest.document_id,
                page_index,
                renderer.native_text(page_index),
            )
            element = DetectedElement(
                element_id=f"p{pdf_page_number:06d}-manual-crop",
                element_type=ElementType.FIGURE,
                page=identity,
                bbox=bbox,
                raw_text="",
                extraction_candidate={"raw_ocr": ""},
                status=ReviewStatus.NEEDS_VISUAL_REVIEW,
                alerts=["manual_bbox_inspection"],
                text_source=layout.text_source,
            )
        else:
            element = _choose_element(elements, element_id)
        if bbox is not None:
            element.bbox = bbox
        packet = build_evidence_packet(
            renderer,
            manifest,
            element,
            output_root,
            dpi=dpi,
            include_context=include_context,
        )
    write_json(
        packet / "inspection.json", {"manifest": asdict(manifest), "element": element.to_dict()}
    )
    manifest.assert_source_unchanged(pdf_path)
    if open_images:
        _open(packet / "full_page_original.png")
        _open(packet / "element_crop_normalized.png")
    return packet


def _choose_element(elements: list[DetectedElement], element_id: str | None) -> DetectedElement:
    if not elements:
        raise RuntimeError("No complex element was detected on this page; provide a bbox.")
    if element_id is None:
        return elements[0]
    for element in elements:
        if element.element_id == element_id:
            return element
    available = ", ".join(element.element_id for element in elements)
    raise ValueError(f"Unknown element_id {element_id!r}. Available: {available}")


def _open(path: Path) -> None:
    if sys.platform == "darwin":
        subprocess.run(["open", str(path)], check=False)
    elif sys.platform.startswith("linux"):
        subprocess.run(["xdg-open", str(path)], check=False)
