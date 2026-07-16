from __future__ import annotations

import csv
import io
import math
import shutil
import statistics
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from src.pdf_evidence.render import PageLayout, PdfRenderer


class LocalOcrError(RuntimeError):
    pass


@dataclass(frozen=True)
class OcrPageResult:
    layout: PageLayout
    raw_tsv: str
    mean_confidence: float | None
    engine: str = "tesseract"


def should_run_ocr(layout: PageLayout, minimum_native_characters: int = 120) -> bool:
    native_text = "".join(
        str(block.get("text", ""))
        for block in layout.blocks
        if int(block.get("block_type", 0)) == 0
    )
    return len(native_text.strip()) < minimum_native_characters


def ocr_page(
    renderer: PdfRenderer,
    page_index: int,
    *,
    dpi: int = 300,
    language: str = "eng",
) -> OcrPageResult:
    executable = shutil.which("tesseract")
    if executable is None:
        raise LocalOcrError("Tesseract is not installed or is not available on PATH.")

    with tempfile.TemporaryDirectory(prefix="pdf-evidence-ocr-") as temporary:
        image_path = Path(temporary) / f"page-{page_index + 1:06d}.png"
        renderer.render(page_index, image_path, dpi=dpi)
        command = [
            executable,
            str(image_path),
            "stdout",
            "-l",
            language,
            "--psm",
            "3",
            "tsv",
        ]
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
            timeout=180,
        )
    if result.returncode != 0:
        message = result.stderr.strip() or "unknown Tesseract failure"
        raise LocalOcrError(f"Tesseract failed on PDF page {page_index + 1}: {message}")

    native_layout = renderer.layout(page_index)
    blocks, confidences = _tsv_to_blocks(
        result.stdout,
        page_width=native_layout.width,
        page_height=native_layout.height,
        dpi=dpi,
    )
    if not blocks:
        raise LocalOcrError(f"Tesseract returned no words on PDF page {page_index + 1}.")
    mean_confidence = statistics.fmean(confidences) / 100 if confidences else None
    return OcrPageResult(
        layout=PageLayout(
            width=native_layout.width,
            height=native_layout.height,
            rotation=native_layout.rotation,
            blocks=blocks,
            text_source="tesseract_ocr",
            text_confidence=mean_confidence,
            alerts=(
                ("scan_skew_detected",) if abs(_estimate_skew_degrees(result.stdout)) >= 0.7 else ()
            ),
            skew_degrees=_estimate_skew_degrees(result.stdout),
        ),
        raw_tsv=result.stdout,
        mean_confidence=mean_confidence,
    )


def _estimate_skew_degrees(tsv: str) -> float:
    """Estimate small scan skew from word baselines without changing the image.

    The estimate is deliberately conservative.  It is only used to trigger a
    visual review; deskewing is left to the evidence renderer so no OCR value is
    silently transformed.
    """
    lines: dict[tuple[int, int, int, int], list[tuple[float, float]]] = {}
    reader = csv.DictReader(io.StringIO(tsv), delimiter="\t")
    for row in reader:
        if row.get("level") != "5" or not (row.get("text") or "").strip():
            continue
        key = (
            _int(row.get("page_num")),
            _int(row.get("block_num")),
            _int(row.get("par_num")),
            _int(row.get("line_num")),
        )
        x = _int(row.get("left")) + _int(row.get("width")) / 2
        y = _int(row.get("top")) + _int(row.get("height")) / 2
        lines.setdefault(key, []).append((x, y))

    angles: list[float] = []
    for points in lines.values():
        if len(points) < 3:
            continue
        mean_x = statistics.fmean(point[0] for point in points)
        mean_y = statistics.fmean(point[1] for point in points)
        denominator = sum((x - mean_x) ** 2 for x, _ in points)
        if denominator <= 0:
            continue
        slope = sum((x - mean_x) * (y - mean_y) for x, y in points) / denominator
        angle = math.degrees(math.atan(slope))
        if abs(angle) <= 8:
            angles.append(angle)
    return round(statistics.median(angles), 3) if angles else 0.0


def _tsv_to_blocks(
    tsv: str,
    *,
    page_width: float,
    page_height: float,
    dpi: int,
) -> tuple[list[dict[str, Any]], list[float]]:
    grouped: dict[tuple[int, int, int], list[dict[str, Any]]] = {}
    confidences: list[float] = []
    reader = csv.DictReader(io.StringIO(tsv), delimiter="\t")
    for row in reader:
        text = (row.get("text") or "").strip()
        if not text or row.get("level") != "5":
            continue
        confidence = _float(row.get("conf"), default=-1)
        if confidence >= 0:
            confidences.append(confidence)
        key = (
            _int(row.get("block_num")),
            _int(row.get("par_num")),
            _int(row.get("line_num")),
        )
        grouped.setdefault(key, []).append(
            {
                "text": text,
                "left": _int(row.get("left")),
                "top": _int(row.get("top")),
                "width": _int(row.get("width")),
                "height": _int(row.get("height")),
                "confidence": confidence,
            }
        )

    scale_x = page_width / max(1, round(page_width * dpi / 72))
    scale_y = page_height / max(1, round(page_height * dpi / 72))
    blocks: list[dict[str, Any]] = []
    for block_number, words in enumerate(grouped.values()):
        words.sort(key=lambda value: value["left"])
        x0 = min(word["left"] for word in words)
        y0 = min(word["top"] for word in words)
        x1 = max(word["left"] + word["width"] for word in words)
        y1 = max(word["top"] + word["height"] for word in words)
        median_height = statistics.median(word["height"] for word in words)
        parts: list[str] = []
        previous_right: int | None = None
        for word in words:
            if previous_right is not None:
                gap = word["left"] - previous_right
                parts.append("\t" if gap > max(12, median_height * 1.5) else " ")
            parts.append(word["text"])
            previous_right = word["left"] + word["width"]
        blocks.append(
            {
                "bbox": [x0 * scale_x, y0 * scale_y, x1 * scale_x, y1 * scale_y],
                "text": "".join(parts),
                "block_number": block_number,
                "block_type": 0,
                "ocr_confidence": _mean_confidence(words),
            }
        )
    return blocks, confidences


def _mean_confidence(words: list[dict[str, Any]]) -> float | None:
    values = [float(word["confidence"]) for word in words if word["confidence"] >= 0]
    return statistics.fmean(values) / 100 if values else None


def _int(value: str | None) -> int:
    try:
        return int(value or 0)
    except ValueError:
        return 0


def _float(value: str | None, *, default: float) -> float:
    try:
        return float(value or default)
    except ValueError:
        return default
