from __future__ import annotations

import re
from collections import Counter
from typing import Any

from src.pdf_evidence.core import (
    BoundingBox,
    DetectedElement,
    ElementType,
    PageIdentity,
    ReviewStatus,
)
from src.pdf_evidence.render import PageLayout

CAPTION_RE = re.compile(
    r"^\s*(?P<kind>figur[eé]|fig\.?|table)\s+(?P<number>\d+(?:[-.]\d+)?)",
    re.I,
)
CONTINUED_RE = re.compile(r"\bcontinued\b|\(\s*cont(?:inued)?\.?\s*\)", re.I)
CAPTION_REFERENCE_RE = re.compile(
    r"^\s*(?:shows?|illustrates?|depicts?|demonstrates?|compares?|summarizes?|"
    r"is\s+shown|can\s+be\s+seen)\b",
    re.I,
)
FORMULA_RE = re.compile(r"[∑∫√≈≤≥∞]|(?:\b[A-Za-z][A-Za-z0-9_]*\s*=\s*[^\n]{2,})")
GREEK_VALUE_RE = re.compile(r"^\s*(?:delta|gamma|theta|vega|rho)\s*=", re.I)
PAYOFF_RE = re.compile(r"\b(profit|loss|payoff|break[- ]?even)\b", re.I)
PL_DIAGRAM_RE = re.compile(r"\bp\s*&\s*/?\s*\(?\s*l\s*\)?\b", re.I)
CHART_RE = re.compile(r"\b(volatility|delta|gamma|theta|vega|rho)\s+vs\.?\b", re.I)
PRINTED_PAGE_RE = re.compile(r"^\s*(\d{1,4})\s*$")
NUMBER_RE = re.compile(r"(?<!\w)[+\-−]?\s*(?:\d+(?:[.,]\d+)?|[.,]\d+|\d+\s*/\s*\d+)")
INTENTIONALLY_BLANK_RE = re.compile(
    r"^\s*(?:this\s+page\s+(?:is\s+)?(?:intentionally\s+)?(?:left\s+)?blank|"
    r"page\s+intentionally\s+left\s+blank)\s*[.!]?\s*$",
    re.I,
)


def page_identity(
    document_id: str,
    page_index: int,
    text: str,
    *,
    blocks: list[dict[str, Any]] | None = None,
    width: float | None = None,
    height: float | None = None,
) -> PageIdentity:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    candidates = lines[:3] + lines[-3:]
    printed_raw = _printed_page_from_margin(blocks or [], width, height)
    if printed_raw is None:
        for candidate in candidates:
            match = PRINTED_PAGE_RE.match(candidate)
            if match:
                printed_raw = match.group(1)
                break
    chapter_match = re.search(r"\bchapter\s+(\d+|[ivxlcdm]+)\b", text, re.I)
    return PageIdentity(
        document_page_id=f"{document_id}:p{page_index + 1:06d}",
        pdf_page_index=page_index,
        pdf_page_number=page_index + 1,
        printed_page_raw=printed_raw,
        printed_page_normalized=int(printed_raw) if printed_raw else None,
        printed_page_confidence=_printed_page_confidence(printed_raw, page_index),
        chapter=chapter_match.group(1) if chapter_match else None,
    )


def detect_elements(document_id: str, page_index: int, layout: PageLayout) -> list[DetectedElement]:
    page_text = "\n".join(str(block["text"]) for block in layout.blocks)
    identity = page_identity(
        document_id,
        page_index,
        page_text,
        blocks=layout.blocks,
        width=layout.width,
        height=layout.height,
    )
    elements: list[DetectedElement] = []

    for block in layout.blocks:
        bbox = BoundingBox(*[float(value) for value in block["bbox"]])
        text = str(block["text"]).strip()
        block_type = int(block["block_type"])
        if block_type == 1:
            if _large_enough(bbox, layout):
                elements.append(
                    _element(
                        identity,
                        ElementType.FIGURE,
                        bbox,
                        "",
                        len(elements),
                        layout.rotation,
                        confidence={
                            "text": layout.text_confidence,
                            "layout": 0.85,
                            "numeric": None,
                        },
                        text_source=layout.text_source,
                    )
                )
            continue
        if not text:
            continue

        caption = CAPTION_RE.search(text)
        if caption:
            # Body prose often starts a new OCR block at “Figure 13.1 shows…”.
            # It is a reference, not a second figure. Keeping it would create a
            # noisy duplicate evidence packet.
            if CAPTION_REFERENCE_RE.match(text[caption.end() :]):
                continue
            kind = caption.group("kind").lower()
            element_type = ElementType.TABLE if kind == "table" else _figure_type(text)
            number = caption.group("number")
            alerts = list(layout.alerts)
            candidate: dict[str, Any] | None = None
            if kind == "table" and CONTINUED_RE.search(text):
                alerts.append("table_continued_requires_context")
                candidate = {"raw_ocr": text, "continuation": True}
            elements.append(
                _element(
                    identity,
                    element_type,
                    _caption_region_bbox(bbox, layout),
                    text,
                    len(elements),
                    layout.rotation,
                    number=number,
                    candidate=candidate,
                    confidence={
                        "text": layout.text_confidence,
                        "layout": 0.88,
                        "numeric": 0.75,
                    },
                    text_source=layout.text_source,
                    alerts=alerts,
                )
            )
            continue

        table_candidate, table_confidence = parse_table_candidate(text)
        if table_candidate:
            elements.append(
                _element(
                    identity,
                    ElementType.TABLE,
                    bbox,
                    text,
                    len(elements),
                    layout.rotation,
                    candidate=table_candidate,
                    confidence={
                        "text": layout.text_confidence,
                        "layout": 0.80,
                        "table_structure": table_confidence,
                        "numeric": 0.75,
                    },
                    text_source=layout.text_source,
                    alerts=list(layout.alerts),
                )
            )
            continue

        # A compact Greek/value row inside a table or figure is data, not a
        # standalone mathematical formula. Treating it as a formula creates
        # duplicate evidence and can hide the surrounding structure.
        if FORMULA_RE.search(text) and not GREEK_VALUE_RE.match(text):
            elements.append(
                _element(
                    identity,
                    ElementType.FORMULA,
                    bbox,
                    text,
                    len(elements),
                    layout.rotation,
                    candidate={
                        "raw_ocr": text,
                        "latex_candidate": None,
                        "plain_text_candidate": None,
                        "ambiguous_tokens": [],
                    },
                    confidence={
                        "text": layout.text_confidence,
                        "layout": 0.90,
                        "formula": 0.65,
                        "numeric": 0.75,
                    },
                    text_source=layout.text_source,
                    alerts=list(layout.alerts),
                )
            )

    if (
        not elements
        and len(page_text.strip()) < 80
        and not INTENTIONALLY_BLANK_RE.fullmatch(page_text.strip())
    ):
        elements.append(
            _element(
                identity,
                ElementType.FIGURE,
                BoundingBox(0, 0, layout.width, layout.height),
                page_text,
                0,
                layout.rotation,
                confidence={
                    "text": layout.text_confidence,
                    "layout": 0.40,
                    "numeric": None,
                },
                alerts=["page_has_too_little_extractable_text"],
                text_source=layout.text_source,
            )
        )
    return _deduplicate(elements)[:30]


def link_cross_page_context(
    previous_elements: list[DetectedElement],
    current_elements: list[DetectedElement],
) -> None:
    """Flag likely figure/caption splits without merging their evidence.

    A link is intentionally only a context hint.  It never copies numeric data
    or promotes either page to a verified extraction.
    """
    previous_numbered = [
        element
        for element in previous_elements
        if element.figure_number
        and element.element_type
        in {ElementType.FIGURE, ElementType.CHART, ElementType.PAYOFF_DIAGRAM}
    ]
    if not previous_numbered:
        return
    for element in current_elements:
        if (
            element.element_type
            in {ElementType.FIGURE, ElementType.CHART, ElementType.PAYOFF_DIAGRAM}
            and element.figure_number is None
            and "page_has_too_little_extractable_text" in element.alerts
        ):
            source = previous_numbered[-1]
            element.alerts.append("figure_caption_on_previous_page")
            element.extraction_candidate["previous_page_caption_element_id"] = source.element_id


def parse_table_candidate(text: str) -> tuple[dict[str, Any], float]:
    rows: list[list[dict[str, Any]]] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        cells = [cell.strip() for cell in re.split(r"\t|\s{2,}", stripped) if cell.strip()]
        if len(cells) < 2:
            numbers = NUMBER_RE.findall(stripped)
            if len(numbers) >= 3:
                cells = [cell.strip() for cell in re.split(r"\s+(?=[+\-−]?(?:\d|[.,]))", stripped)]
        if len(cells) >= 2:
            rows.append([_cell(cell) for cell in cells])
    if len(rows) < 2:
        return {}, 0.0
    widths = [len(row) for row in rows]
    common_width, common_count = Counter(widths).most_common(1)[0]
    numeric_count = sum(1 for row in rows for cell in row if cell.get("numeric_value") is not None)
    cell_count = sum(widths)
    if common_width < 2 or numeric_count < 3:
        return {}, 0.0
    structure_confidence = round(
        (common_count / len(rows)) * 0.7 + (numeric_count / cell_count) * 0.3, 3
    )
    return {"columns": common_width, "rows": rows}, structure_confidence


def _cell(raw: str) -> dict[str, Any]:
    normalized = raw.replace("−", "-").replace(",", ".").replace(" ", "")
    numeric_value: float | None = None
    if re.fullmatch(r"[+\-]?(?:\d+(?:\.\d+)?|\.\d+)", normalized):
        numeric_value = float(normalized)
    elif re.fullmatch(r"[+\-]?\d+/\d+", normalized):
        sign = -1.0 if normalized.startswith("-") else 1.0
        fraction = normalized.lstrip("+-")
        numerator, denominator = fraction.split("/")
        numeric_value = sign * int(numerator) / int(denominator)
    decimal_digits = len(normalized.rsplit(".", 1)[1]) if "." in normalized else 0
    return {
        "raw_ocr": raw,
        "normalized_text": normalized,
        "numeric_value": numeric_value,
        "sign": "-" if normalized.startswith("-") else "+" if normalized.startswith("+") else None,
        "decimal_digits": decimal_digits,
        "bbox": None,
        "ocr_confidence": None,
        "gemini_candidates": [],
        "gemini_confidence": None,
        "codex_review": None,
        "final_status": ReviewStatus.NEEDS_VISUAL_REVIEW.value,
    }


def _element(
    page: PageIdentity,
    element_type: ElementType,
    bbox: BoundingBox,
    text: str,
    ordinal: int,
    rotation: int,
    *,
    number: str | None = None,
    candidate: dict[str, Any] | None = None,
    confidence: dict[str, float | None] | None = None,
    alerts: list[str] | None = None,
    text_source: str = "native_pdf_text",
) -> DetectedElement:
    prefix = element_type.value.replace("_diagram", "")
    number_slug = re.sub(r"[^0-9a-z]+", "-", number.lower()).strip("-") if number else ""
    suffix = number_slug or f"{ordinal + 1:02d}"
    element_alerts = list(alerts or [])
    if page.printed_page_raw and page.printed_page_confidence < 0.8:
        element_alerts.append("printed_page_mapping_low_confidence")
    return DetectedElement(
        element_id=f"p{page.pdf_page_number:06d}-{prefix}-{suffix}",
        element_type=element_type,
        page=page,
        bbox=bbox,
        raw_text=text,
        rotation=rotation,
        table_number=number if element_type == ElementType.TABLE else None,
        figure_number=number if element_type != ElementType.TABLE else None,
        extraction_candidate=candidate or {"raw_ocr": text},
        confidence=confidence or {},
        alerts=element_alerts,
        status=(
            ReviewStatus.IMAGE_ONLY
            if element_type in {ElementType.FIGURE, ElementType.CHART, ElementType.PAYOFF_DIAGRAM}
            else ReviewStatus.NEEDS_VISUAL_REVIEW
        ),
        text_source=text_source,
        data_digitized=(
            False
            if element_type in {ElementType.FIGURE, ElementType.CHART, ElementType.PAYOFF_DIAGRAM}
            else None
        ),
    )


def _figure_type(text: str) -> ElementType:
    if PAYOFF_RE.search(text) or PL_DIAGRAM_RE.search(text):
        return ElementType.PAYOFF_DIAGRAM
    if CHART_RE.search(text):
        return ElementType.CHART
    return ElementType.FIGURE


def _large_enough(bbox: BoundingBox, layout: PageLayout) -> bool:
    return (bbox.x1 - bbox.x0) * (bbox.y1 - bbox.y0) >= layout.width * layout.height * 0.04


def _expanded_bbox(bbox: BoundingBox, layout: PageLayout, margin: float) -> BoundingBox:
    return BoundingBox(
        max(0, bbox.x0 - margin),
        max(0, bbox.y0 - margin),
        min(layout.width, bbox.x1 + margin),
        min(layout.height, bbox.y1 + margin),
    )


def _caption_region_bbox(bbox: BoundingBox, layout: PageLayout) -> BoundingBox:
    """Include the visual object below a caption, not only the caption text.

    PDF layout engines often expose a caption as one text block and a table or
    chart as a separate block (or no text block at all).  A narrow caption crop
    therefore gives a multimodal reviewer less evidence than the full page.
    We use the next caption as a deterministic boundary and otherwise reserve
    up to 55% of the page height below the caption.  The full page remains in
    every evidence packet, so this deliberately favours recall over precision.
    """
    next_caption_y: float | None = None
    for block in layout.blocks:
        text = str(block.get("text", "")).strip()
        block_bbox = block.get("bbox", [])
        if len(block_bbox) != 4 or not CAPTION_RE.search(text):
            continue
        candidate_y = float(block_bbox[1])
        if candidate_y > bbox.y0 + 2 and (next_caption_y is None or candidate_y < next_caption_y):
            next_caption_y = candidate_y

    lower_bound = min(layout.height, bbox.y0 + layout.height * 0.55)
    if next_caption_y is not None:
        lower_bound = min(lower_bound, max(bbox.y1, next_caption_y - 8))
    return BoundingBox(
        8,
        max(0, bbox.y0 - 8),
        max(8, layout.width - 8),
        max(bbox.y1, lower_bound),
    )


def _deduplicate(elements: list[DetectedElement]) -> list[DetectedElement]:
    numbered_regions = [
        element
        for element in elements
        if element.table_number is not None or element.figure_number is not None
    ]
    seen: set[tuple[str, int, int, int, int]] = set()
    result: list[DetectedElement] = []
    for element in elements:
        if element not in numbered_regions and any(
            _same_visual_family(element, region) and _coverage(element.bbox, region.bbox) >= 0.70
            for region in numbered_regions
        ):
            continue
        key = (
            element.element_type.value,
            round(element.bbox.x0),
            round(element.bbox.y0),
            round(element.bbox.x1),
            round(element.bbox.y1),
        )
        if key not in seen:
            seen.add(key)
            result.append(element)
    # Printed documents sometimes mention a figure again in body text on the
    # same page. Those mentions may produce the same semantic identifier as the
    # actual caption. Evidence directories must never overwrite each other, so
    # keep both candidates but assign a deterministic suffix and flag them.
    occurrences: Counter[str] = Counter()
    for element in result:
        occurrences[element.element_id] += 1
        occurrence = occurrences[element.element_id]
        if occurrence > 1:
            element.alerts.append("duplicate_number_on_page")
            element.element_id = f"{element.element_id}-candidate-{occurrence:02d}"
    return result


def _printed_page_confidence(printed_raw: str | None, page_index: int) -> float:
    """Return conservative confidence for an OCR-derived printed page.

    A single isolated digit is often a damaged fragment of a multi-digit page
    number (for example ``249`` becoming ``7``). It remains useful as a
    candidate, but must not be presented as a high-confidence mapping.
    """
    if printed_raw is None:
        return 0.0
    confidence = {1: 0.55, 2: 0.85}.get(len(printed_raw), 0.95)
    printed_number = int(printed_raw)
    pdf_number = page_index + 1
    if printed_number == pdf_number:
        confidence = min(0.99, confidence + 0.03)
    elif abs(printed_number - pdf_number) > 120:
        confidence = min(confidence, 0.35)
    return confidence


def _printed_page_from_margin(
    blocks: list[dict[str, Any]],
    width: float | None,
    height: float | None,
) -> str | None:
    """Prefer isolated numbers physically located in a page margin.

    OCR block order is not a reliable spatial order. A number from a table near
    the end of the OCR stream must not become the printed page number merely
    because it is one of the last text lines.
    """
    if not blocks or not width or not height:
        return None
    candidates: list[tuple[float, str]] = []
    for block in blocks:
        match = PRINTED_PAGE_RE.fullmatch(str(block.get("text", "")).strip())
        bbox = block.get("bbox", [])
        if match is None or len(bbox) != 4:
            continue
        x_center = (float(bbox[0]) + float(bbox[2])) / 2
        y_center = (float(bbox[1]) + float(bbox[3])) / 2
        vertical_margin = min(y_center / height, 1 - y_center / height)
        if vertical_margin > 0.16:
            continue
        horizontal_margin = min(x_center / width, 1 - x_center / width)
        candidates.append((vertical_margin + 0.15 * horizontal_margin, match.group(1)))
    return min(candidates, default=(0.0, None))[1]


def _same_visual_family(first: DetectedElement, second: DetectedElement) -> bool:
    figure_types = {
        ElementType.FIGURE,
        ElementType.CHART,
        ElementType.PAYOFF_DIAGRAM,
    }
    return (
        first.element_type == second.element_type == ElementType.TABLE
        or first.element_type in figure_types
        and second.element_type in figure_types
    )


def _coverage(inner: BoundingBox, outer: BoundingBox) -> float:
    intersection_width = max(0.0, min(inner.x1, outer.x1) - max(inner.x0, outer.x0))
    intersection_height = max(0.0, min(inner.y1, outer.y1) - max(inner.y0, outer.y0))
    intersection = intersection_width * intersection_height
    area = max(0.0, inner.x1 - inner.x0) * max(0.0, inner.y1 - inner.y0)
    return intersection / area if area else 0.0
