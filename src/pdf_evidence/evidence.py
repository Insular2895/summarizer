from __future__ import annotations

import shutil
from dataclasses import asdict
from pathlib import Path

from src.pdf_evidence.core import DetectedElement, DocumentManifest, write_json
from src.pdf_evidence.render import PdfRenderer


def build_evidence_packet(
    renderer: PdfRenderer,
    manifest: DocumentManifest,
    element: DetectedElement,
    evidence_root: Path,
    *,
    dpi: int = 350,
    include_context: bool = False,
) -> Path:
    packet = evidence_root / element.element_id
    packet.mkdir(parents=True, exist_ok=True)
    page_index = element.page.pdf_page_index

    original = renderer.render(page_index, packet / "full_page_original.png", dpi=dpi)
    if (
        _red_annotation_ratio(original) >= 0.0005
        and "external_annotations_detected" not in element.alerts
    ):
        element.alerts.append("external_annotations_detected")
    shutil.copy2(original, packet / "full_page_preprocessed.png")
    crop = renderer.render(
        page_index,
        packet / "element_crop_original.png",
        dpi=dpi,
        bbox=element.bbox,
    )
    shutil.copy2(crop, packet / "element_crop_normalized.png")

    if include_context and page_index > 0:
        renderer.render(page_index - 1, packet / "previous_page.png", dpi=min(dpi, 250))
    if include_context and page_index + 1 < renderer.page_count:
        renderer.render(page_index + 1, packet / "next_page.png", dpi=min(dpi, 250))

    native_text = renderer.native_text(page_index)
    (packet / "native_text.txt").write_text(native_text, encoding="utf-8")
    (packet / "ocr_text.txt").write_text(element.raw_text, encoding="utf-8")
    write_json(packet / "extraction_candidate.json", element.extraction_candidate)
    write_json(
        packet / "metadata.json",
        {
            "document_id": manifest.document_id,
            "source_sha256": manifest.sha256,
            "pdf_page_index": page_index,
            "pdf_page_number": page_index + 1,
            "printed_page": element.page.printed_page_normalized,
            "chapter": element.page.chapter,
            "section": element.page.section,
            "element_id": element.element_id,
            "element_type": element.element_type.value,
            "bbox": element.bbox.as_list(),
            "source_rotation": element.rotation,
            "rotation_applied": element.rotation,
            "normalization_method": "pymupdf_page_rotation_then_crop",
            "ocr_text_source": element.text_source,
            "data_digitized": element.data_digitized,
            "alerts": element.alerts,
            "page_identity": asdict(element.page),
        },
    )
    return packet


def _red_annotation_ratio(image_path: Path) -> float:
    """Return the ratio of strongly red pixels in a rendered evidence image."""
    try:
        import fitz

        pixmap = fitz.Pixmap(str(image_path))
    except Exception:  # pragma: no cover - defensive for unsupported image builds
        return 0.0
    channels = pixmap.n
    if channels < 3 or pixmap.width * pixmap.height == 0:
        return 0.0
    red = 0
    samples = pixmap.samples
    for index in range(0, len(samples), channels):
        r, g, b = samples[index], samples[index + 1], samples[index + 2]
        if r >= 180 and r - g >= 70 and r - b >= 70:
            red += 1
    return red / (pixmap.width * pixmap.height)
