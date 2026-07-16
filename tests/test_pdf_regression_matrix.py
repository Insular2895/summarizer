from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

import fitz
import pytest

from src.pdf_evidence.core import (
    BoundingBox,
    DetectedElement,
    DocumentManifest,
    ElementType,
    PageIdentity,
    ReviewStatus,
)
from src.pdf_evidence.detect import (
    _cell,
    detect_elements,
    link_cross_page_context,
    page_identity,
    parse_table_candidate,
)
from src.pdf_evidence.evidence import _red_annotation_ratio, build_evidence_packet
from src.pdf_evidence.fallback import record_codex_visual_fallback
from src.pdf_evidence.ocr import _estimate_skew_degrees, _tsv_to_blocks
from src.pdf_evidence.pipeline import TechnicalPdfEvidencePipeline
from src.pdf_evidence.regression import evaluate_regression_manifest
from src.pdf_evidence.render import PageLayout, PdfRenderer
from src.pdf_evidence.validation import (
    run_deterministic_checks,
    status_after_visual_review,
    validate_visual_review_response,
)


def _page(page_number: int = 1, printed_page: int | None = 1) -> PageIdentity:
    return PageIdentity(
        document_page_id=f"doc:p{page_number:06d}",
        pdf_page_index=page_number - 1,
        pdf_page_number=page_number,
        printed_page_raw=str(printed_page) if printed_page is not None else None,
        printed_page_normalized=printed_page,
        printed_page_confidence=0.99,
        chapter="1",
    )


def _element(element_type: ElementType = ElementType.TABLE) -> DetectedElement:
    return DetectedElement(
        element_id=f"p000001-{element_type.value}-01",
        element_type=element_type,
        page=_page(),
        bbox=BoundingBox(10, 10, 250, 200),
        raw_text="Theta  -0.50\nVega  +1.15",
        extraction_candidate={"raw_ocr": "Theta  -0.50\nVega  +1.15"},
    )


def _review(element: DetectedElement, **overrides: object) -> dict[str, object]:
    review: dict[str, object] = {
        "element_id": element.element_id,
        "media_readable": True,
        "observed_type": element.element_type.value,
        "observed_rotation": element.rotation,
        "structure": {"columns": ["Greek", "Value"], "rows": [["Theta", "-0.50"]]},
        "disagreements": [],
        "ambiguous_regions": [],
        "missing_context": [],
        "confidence": {
            "visual_readability": 0.99,
            "table_structure": 0.99,
            "numeric": 0.99,
            "formula": None,
        },
        "recommended_status": ReviewStatus.MACHINE_VERIFIED_WITH_VISUAL_CHECK.value,
    }
    review.update(overrides)
    return review


def _layout(
    text: str,
    *,
    rotation: int = 0,
    confidence: float = 0.99,
    alerts: tuple[str, ...] = (),
) -> PageLayout:
    return PageLayout(
        width=300,
        height=300,
        rotation=rotation,
        blocks=[{"bbox": [20, 20, 280, 80], "text": text, "block_type": 0}],
        text_source="synthetic_fixture",
        text_confidence=confidence,
        alerts=alerts,
    )


def _make_pdf(path: Path, drawers: list[Callable[[fitz.Page], None]]) -> None:
    document = fitz.open()
    for drawer in drawers:
        page = document.new_page(width=300, height=300)
        drawer(page)
    document.save(path)
    document.close()


def _tsv(words: list[tuple[str, int, int]]) -> str:
    header = (
        "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\t"
        "width\theight\tconf\ttext"
    )
    rows = [
        f"5\t1\t1\t1\t1\t{index}\t{x}\t{y}\t20\t10\t98\t{text}"
        for index, (text, x, y) in enumerate(words, start=1)
    ]
    return "\n".join([header, *rows]) + "\n"


def test_g01_native_text_clean_table_is_structured() -> None:
    candidate, confidence = parse_table_candidate(
        "Greek  Value  Quantity\nDelta  +0.50  +20\nTheta  -0.0060  -30"
    )

    assert candidate["columns"] == 3
    assert candidate["rows"][2][1]["numeric_value"] == -0.006
    assert confidence >= 0.8


def test_g02_scan_clean_tsv_preserves_words_and_confidence() -> None:
    blocks, confidences = _tsv_to_blocks(
        _tsv([("Theta", 10, 20), ("-0.50", 100, 20), ("Vega", 180, 20)]),
        page_width=300,
        page_height=300,
        dpi=72,
    )

    assert "Theta" in blocks[0]["text"]
    assert "-0.50" in blocks[0]["text"]
    assert confidences == [98.0, 98.0, 98.0]


def test_g03_scan_skewed_is_detected_and_cannot_be_auto_verified() -> None:
    skew = _estimate_skew_degrees(_tsv([("one", 10, 20), ("two", 100, 24), ("three", 190, 28)]))
    element = _element()
    element.alerts.append("scan_skew_detected")

    assert abs(skew) >= 0.7
    assert status_after_visual_review(element, _review(element)) == ReviewStatus.NEEDS_VISUAL_REVIEW


def test_g04_low_contrast_numeric_review_stays_unverified() -> None:
    element = _element()
    review = _review(
        element,
        confidence={
            "visual_readability": 0.70,
            "table_structure": 0.99,
            "numeric": 0.80,
            "formula": None,
        },
    )

    assert status_after_visual_review(element, review) == ReviewStatus.NEEDS_VISUAL_REVIEW


def test_g05_rotated_table_keeps_source_rotation_and_requires_review() -> None:
    elements = detect_elements(
        "doc",
        0,
        _layout("Table 5-1 Position Greeks\nGreek  Value\nTheta  -0.50", rotation=90),
    )

    assert elements[0].element_type == ElementType.TABLE
    assert elements[0].rotation == 90
    assert elements[0].status == ReviewStatus.NEEDS_VISUAL_REVIEW


def test_g06_multi_level_headers_keep_consistent_columns() -> None:
    candidate, confidence = parse_table_candidate(
        "Position  Calls  Puts\nGreek  Long  Short\nDelta  +0.50  -0.50\nTheta  -0.02  +0.02"
    )

    assert candidate["columns"] == 3
    assert all(len(row) == 3 for row in candidate["rows"])
    assert confidence >= 0.8


def test_g07_signed_decimals_are_not_normalized_without_sign() -> None:
    negative = _cell("-.0060")
    positive = _cell("+.0060")

    assert negative["raw_ocr"] == "-.0060"
    assert negative["sign"] == "-"
    assert negative["numeric_value"] == -0.006
    assert positive["sign"] == "+"
    assert positive["numeric_value"] == 0.006


def test_g08_fractions_preserve_raw_form_and_numeric_value() -> None:
    fraction = _cell("-3/4")

    assert fraction["raw_ocr"] == "-3/4"
    assert fraction["normalized_text"] == "-3/4"
    assert fraction["numeric_value"] == -0.75


def test_g09_formula_without_structure_requires_visual_review() -> None:
    elements = detect_elements("doc", 0, _layout("elasticity = underlying price / value x delta"))
    formula = next(element for element in elements if element.element_type == ElementType.FORMULA)

    alerts = run_deterministic_checks(formula)

    assert "formula_structure_ambiguous" in alerts
    assert formula.status == ReviewStatus.NEEDS_VISUAL_REVIEW


def test_g10_payoff_diagram_is_image_only_not_silently_digitized() -> None:
    element = detect_elements("doc", 0, _layout("Figure 10-1 Profit and Loss Payoff"))[0]

    assert element.element_type == ElementType.PAYOFF_DIAGRAM
    assert element.data_digitized is False
    assert element.status == ReviewStatus.IMAGE_ONLY


def test_g11_multi_series_chart_is_image_only_not_silently_digitized() -> None:
    element = detect_elements(
        "doc", 0, _layout("Figure 14-1 Implied Volatility vs. Realized Volatility")
    )[0]

    assert element.element_type == ElementType.CHART
    assert element.data_digitized is False
    assert element.status == ReviewStatus.IMAGE_ONLY


def test_g12_external_red_annotation_is_detected_in_rendered_evidence(tmp_path: Path) -> None:
    pdf = tmp_path / "red-annotation.pdf"

    def draw(page: fitz.Page) -> None:
        page.insert_text((20, 30), "Figure 1-1 Payoff", fontsize=12)
        page.draw_rect(fitz.Rect(10, 100, 290, 150), color=(1, 0, 0), fill=(1, 0, 0))

    _make_pdf(pdf, [draw])
    manifest = DocumentManifest.from_pdf(pdf)
    element = _element(ElementType.FIGURE)
    with PdfRenderer(pdf) as renderer:
        packet = build_evidence_packet(renderer, manifest, element, tmp_path / "evidence", dpi=120)

    assert _red_annotation_ratio(packet / "full_page_original.png") >= 0.0005
    assert "external_annotations_detected" in element.alerts


def test_g13_pdf_and_printed_page_numbers_remain_distinct() -> None:
    identity = page_identity("doc", 131, "121\nChapter 6\nBody")

    assert identity.pdf_page_index == 131
    assert identity.pdf_page_number == 132
    assert identity.printed_page_normalized == 121


def test_g14_continued_table_is_flagged_and_gets_previous_page_context(tmp_path: Path) -> None:
    elements = detect_elements("doc", 1, _layout("Table 7-2 (continued)\nTheta  -0.50"))
    element = elements[0]
    pdf = tmp_path / "continued.pdf"
    _make_pdf(
        pdf,
        [
            lambda page: page.insert_text((20, 30), "Table 7-2 first page"),
            lambda page: page.insert_text((20, 30), "Table 7-2 continued"),
        ],
    )
    manifest = DocumentManifest.from_pdf(pdf)
    with PdfRenderer(pdf) as renderer:
        packet = build_evidence_packet(
            renderer, manifest, element, tmp_path / "evidence", dpi=120, include_context=True
        )

    assert "table_continued_requires_context" in element.alerts
    assert (packet / "previous_page.png").exists()


def test_g15_figure_caption_on_previous_page_is_linked_without_copying_data() -> None:
    previous = detect_elements("doc", 0, _layout("Figure 13-3 P&L Diagram"))
    current = detect_elements("doc", 1, _layout(""))

    link_cross_page_context(previous, current)

    assert "figure_caption_on_previous_page" in current[0].alerts
    assert (
        current[0].extraction_candidate["previous_page_caption_element_id"]
        == previous[0].element_id
    )
    assert "raw_ocr" in current[0].extraction_candidate


class _FailingReviewer:
    def review(self, _element: DetectedElement, _packet: Path) -> dict[str, object]:
        raise RuntimeError("synthetic Gemini outage")


def test_g16_gemini_api_failure_creates_fallback_without_mutating_source(tmp_path: Path) -> None:
    pdf = tmp_path / "gemini-failure.pdf"
    _make_pdf(pdf, [lambda page: page.insert_text((20, 30), "Table 1-1 Position Greeks")])
    before = pdf.read_bytes()
    result = TechnicalPdfEvidencePipeline(
        reviewer=_FailingReviewer(),
        visual_review_enabled=True,
        ocr_min_native_characters=0,
        dpi=120,
    ).run(pdf, tmp_path / "result")
    sidecar = json.loads(result.sidecar_path.read_text(encoding="utf-8"))
    packet = result.evidence_root / sidecar["elements"][0]["element_id"]

    assert pdf.read_bytes() == before
    assert sidecar["elements"][0]["status"] == ReviewStatus.HUMAN_REVIEW_REQUIRED.value
    assert "gemini_visual_review_failed" in sidecar["elements"][0]["alerts"]
    assert (packet / "fallback_request.json").exists()


def test_g17_gemini_invalid_json_is_rejected() -> None:
    with pytest.raises(ValueError):
        validate_visual_review_response({"element_id": "wrong"}, "expected")


def test_g18_gemini_ocr_sign_disagreement_blocks_promotion() -> None:
    element = _element()
    disagreement = {
        "location": {"row": 1, "column": "theta"},
        "ocr_value": "+0.50",
        "visual_candidates": ["-0.50", "+0.50"],
        "preferred_candidate": "-0.50",
        "confidence": 0.99,
        "reason": "negative sign visible",
    }
    review = _review(element, disagreements=[disagreement])

    assert status_after_visual_review(element, review) == ReviewStatus.BLOCKED


def test_g19_codex_media_unavailable_requires_human_review(tmp_path: Path) -> None:
    packet = tmp_path / "packet"
    packet.mkdir()
    review_path = record_codex_visual_fallback(
        packet,
        element_id="p000001-table-01",
        media_available=True,
    )
    review = json.loads(review_path.read_text(encoding="utf-8"))

    assert review["evidence_opened"] is False
    assert review["reason"] == "codex_media_unavailable"
    assert review["recommended_status"] == ReviewStatus.HUMAN_REVIEW_REQUIRED.value


def test_regression_manifest_covers_exactly_g01_through_g19() -> None:
    report = evaluate_regression_manifest(
        Path(__file__).parent / "golden" / "pdf_evidence" / "manifest.json"
    )

    assert report["status"] == "pass"
    assert report["cases_expected"] == 19
    assert report["cases_covered"] == 19
    assert report["synthetic_regression_coverage"] == 1.0
