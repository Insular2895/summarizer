from __future__ import annotations

import json
import shutil
from pathlib import Path

import fitz
import pytest

from src.config import ModelConfig
from src.llm.gemini_client import GeminiInvalidJsonError, GeminiQuotaError
from src.pdf_evidence.core import (
    BoundingBox,
    DetectedElement,
    ElementType,
    PageIdentity,
    ReviewStatus,
    sha256_file,
)
from src.pdf_evidence.detect import _cell, detect_elements, page_identity, parse_table_candidate
from src.pdf_evidence.gemini_review import GeminiVisualReviewer
from src.pdf_evidence.inspect import inspect_pdf_element
from src.pdf_evidence.pipeline import TechnicalPdfEvidencePipeline
from src.pdf_evidence.render import PageLayout
from src.pdf_evidence.validation import (
    check_arithmetic_expressions,
    run_deterministic_checks,
    status_after_visual_review,
    validate_visual_review_response,
)


def _page() -> PageIdentity:
    return PageIdentity("doc:p000001", 0, 1, "7", 7, 0.99, "1")


def _element(element_type: ElementType = ElementType.TABLE) -> DetectedElement:
    return DetectedElement(
        element_id="p000001-table-1-1",
        element_type=element_type,
        page=_page(),
        bbox=BoundingBox(10, 10, 200, 180),
        raw_text="Table 1-1\nTheta  -.0060\nVega  .100",
        extraction_candidate={"columns": 2, "rows": [[{"raw_ocr": "Theta"}, _cell("-.0060")]]},
    )


def _review(element: DetectedElement, **overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "element_id": element.element_id,
        "media_readable": True,
        "observed_type": element.element_type.value,
        "observed_rotation": 0,
        "structure": {"columns": ["name", "value"], "rows": [["Theta", "-.0060"]]},
        "disagreements": [],
        "ambiguous_regions": [],
        "missing_context": [],
        "confidence": {
            "visual_readability": 0.99,
            "table_structure": 0.99,
            "numeric": 0.99,
            "formula": None,
        },
        "recommended_status": "machine_verified_with_visual_check",
    }
    value.update(overrides)
    return value


def _make_native_pdf(path: Path) -> None:
    document = fitz.open()
    page = document.new_page(width=612, height=792)
    page.insert_text((48, 55), "Chapter 1", fontsize=12)
    page.insert_text((48, 90), "Table 1-1: Position Greeks", fontsize=14)
    page.insert_text((70, 130), "Metric      Value", fontsize=12)
    page.insert_text((70, 155), "Theta       -.0060", fontsize=12)
    page.insert_text((70, 180), "Vega        .100", fontsize=12)
    page.insert_text((70, 205), "+20 x .13 = +2.60", fontsize=12)
    document.save(path)
    document.close()


def _make_scanned_pdf(path: Path, temporary: Path) -> None:
    native = temporary / "native.pdf"
    _make_native_pdf(native)
    source = fitz.open(native)
    pixmap = source[0].get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    image = pixmap.tobytes("png")
    source.close()
    scanned = fitz.open()
    page = scanned.new_page(width=612, height=792)
    page.insert_image(page.rect, stream=image)
    scanned.save(path)
    scanned.close()


def test_numeric_cells_preserve_sign_decimal_digits_and_fraction() -> None:
    negative = _cell("-.0060")
    positive = _cell(".0060")
    fraction = _cell("-3/4")

    assert negative["raw_ocr"] == "-.0060"
    assert negative["numeric_value"] == -0.006
    assert negative["sign"] == "-"
    assert negative["decimal_digits"] == 4
    assert positive["numeric_value"] == 0.006
    assert positive["sign"] is None
    assert fraction["numeric_value"] == -0.75


def test_table_parser_keeps_raw_numeric_cells() -> None:
    candidate, confidence = parse_table_candidate(
        "Greek  Value  Quantity\nTheta  -.0060  +20\nVega  .100  -30"
    )

    assert confidence > 0.8
    assert candidate["columns"] == 3
    assert candidate["rows"][1][1]["raw_ocr"] == "-.0060"


def test_page_identity_marks_single_digit_ocr_mapping_as_low_confidence() -> None:
    identity = page_identity("doc", 272, "7\nBody text")

    assert identity.printed_page_raw == "7"
    assert identity.printed_page_confidence == 0.35


def test_page_identity_prefers_margin_number_over_table_value() -> None:
    layout = PageLayout(
        width=600,
        height=800,
        rotation=0,
        text_confidence=0.9,
        text_source="tesseract_ocr",
        blocks=[
            {"bbox": [550, 20, 580, 45], "text": "249", "block_type": 0},
            {"bbox": [80, 350, 110, 375], "text": "43", "block_type": 0},
        ],
    )

    elements = detect_elements("doc", 272, layout)

    assert elements[0].page.printed_page_normalized == 249


def test_body_figure_reference_is_not_treated_as_a_caption() -> None:
    layout = PageLayout(
        width=600,
        height=800,
        rotation=0,
        text_confidence=0.9,
        text_source="tesseract_ocr",
        blocks=[
            {
                "bbox": [40, 100, 550, 150],
                "text": (
                    "As shown in FIGURE 14.1, volatility changed during the period, "
                    "but this sentence is only a narrative cross-reference."
                ),
                "block_type": 0,
            }
        ],
    )

    assert detect_elements("doc", 0, layout) == []


def test_accented_ocr_figure_caption_and_pl_diagram_are_detected() -> None:
    layout = PageLayout(
        width=600,
        height=800,
        rotation=0,
        text_confidence=0.75,
        text_source="tesseract_ocr",
        blocks=[
            {
                "bbox": [40, 650, 550, 690],
                "text": (
                    "Figuré 13.3 P&/(L) Diagram for a Positive-Gamma " "Delta-Neutral Position"
                ),
                "block_type": 0,
            }
        ],
    )

    elements = detect_elements("doc", 283, layout)

    assert len(elements) == 1
    assert elements[0].element_type == ElementType.PAYOFF_DIAGRAM
    assert elements[0].figure_number == "13.3"
    assert "printed_page_mapping_low_confidence" not in elements[0].alerts


def test_duplicate_figure_numbers_receive_unique_evidence_ids() -> None:
    layout = PageLayout(
        width=600,
        height=800,
        rotation=0,
        text_confidence=0.9,
        text_source="tesseract_ocr",
        blocks=[
            {
                "bbox": [40, 50, 500, 75],
                "text": "Figure 13.1 Greeks for a delta-neutral call",
                "block_type": 0,
            },
            {
                "bbox": [40, 400, 500, 430],
                "text": "FIGURE 13.1 Alternative rendering",
                "block_type": 0,
            },
        ],
    )

    elements = detect_elements("doc", 0, layout)

    assert len(elements) == 2
    assert len({element.element_id for element in elements}) == 2
    assert "duplicate_number_on_page" in elements[1].alerts


def test_figure_cross_reference_does_not_create_noise() -> None:
    layout = PageLayout(
        width=600,
        height=800,
        rotation=0,
        text_confidence=0.9,
        text_source="tesseract_ocr",
        blocks=[
            {
                "bbox": [40, 50, 500, 75],
                "text": "Figure 13.1 Greeks for a delta-neutral call",
                "block_type": 0,
            },
            {
                "bbox": [40, 400, 500, 430],
                "text": "FIGURE 13.1 shows the relationship described above",
                "block_type": 0,
            },
        ],
    )

    elements = detect_elements("doc", 0, layout)

    assert [element.element_id for element in elements] == ["p000001-figure-13-1"]


def test_intentionally_blank_page_does_not_become_a_full_page_figure() -> None:
    layout = PageLayout(
        width=600,
        height=800,
        rotation=0,
        text_confidence=0.99,
        text_source="native_text",
        blocks=[
            {
                "bbox": [200, 390, 400, 420],
                "text": "This page intentionally left blank.",
                "block_type": 0,
            }
        ],
    )

    assert detect_elements("doc", 0, layout) == []


def test_visual_review_schema_rejects_nested_aliases() -> None:
    element = _element()
    value = _review(
        element,
        disagreements=[
            {
                "location": "theta",
                "ocr_value": "-.0060",
                "visual_candidates": ["-.0060"],
                "preferred_reading": "-.0060",
                "confidence": 0.99,
                "reason": "Visible",
            }
        ],
    )

    with pytest.raises(ValueError, match="preferred_candidate"):
        validate_visual_review_response(value, element.element_id)


def test_deterministic_arithmetic_and_column_checks_block() -> None:
    assert check_arithmetic_expressions("+20 x .13 = +2.60") == []
    assert check_arithmetic_expressions("-30 × .100 = -3.00") == []
    assert check_arithmetic_expressions("+20 x .13 = +3.20") == ["arithmetic_check_failed"]

    element = _element()
    element.extraction_candidate = {
        "columns": 2,
        "rows": [[_cell("20"), _cell(".13")], [_cell("30")]],
    }
    run_deterministic_checks(element)
    assert element.status == ReviewStatus.BLOCKED
    assert "column_shift_risk" in element.alerts


def test_visual_review_never_overrides_deterministic_block() -> None:
    element = _element()
    element.status = ReviewStatus.BLOCKED

    assert status_after_visual_review(element, _review(element)) == ReviewStatus.BLOCKED


def test_visual_review_blocks_sign_disagreement_and_keeps_figures_image_only() -> None:
    table = _element()
    disagreement = {
        "location": {"row": 1, "column": "theta"},
        "ocr_value": ".0060",
        "visual_candidates": ["-.0060", ".0060"],
        "preferred_candidate": "-.0060",
        "confidence": 0.84,
        "reason": "Possible negative sign",
    }
    assert (
        status_after_visual_review(table, _review(table, disagreements=[disagreement]))
        == ReviewStatus.BLOCKED
    )

    figure = _element(ElementType.CHART)
    assert status_after_visual_review(figure, _review(figure)) == ReviewStatus.IMAGE_ONLY


def test_visual_review_accepts_nontechnical_observation_without_trusting_it() -> None:
    element = _element(ElementType.FIGURE)
    value = _review(
        element,
        observed_type="text_block",
        recommended_status="needs_visual_review",
    )

    validate_visual_review_response(value, element.element_id)
    assert status_after_visual_review(element, value) == ReviewStatus.NEEDS_VISUAL_REVIEW


class _ConfirmingReviewer:
    def review(self, element: DetectedElement, _packet: Path) -> dict[str, object]:
        return _review(element)


class _FailingReviewer:
    def review(self, _element: DetectedElement, _packet: Path) -> dict[str, object]:
        raise RuntimeError("simulated Gemini outage")


class _QuotaReviewer:
    def __init__(self) -> None:
        self.calls = 0

    def review(self, _element: DetectedElement, _packet: Path) -> dict[str, object]:
        self.calls += 1
        raise GeminiQuotaError("quota exceeded for free_tier_requests")


def test_pipeline_writes_sidecar_evidence_and_preserves_source(tmp_path: Path) -> None:
    pdf = tmp_path / "technical.pdf"
    _make_native_pdf(pdf)
    digest = sha256_file(pdf)

    result = TechnicalPdfEvidencePipeline(
        reviewer=_ConfirmingReviewer(),
        max_visual_calls=5,
    ).run(pdf, tmp_path / "result")

    assert sha256_file(pdf) == digest
    assert result.pages_analyzed == 1
    assert result.elements_detected >= 1
    sidecar = json.loads(result.sidecar_path.read_text(encoding="utf-8"))
    quality = json.loads(result.quality_report_path.read_text(encoding="utf-8"))
    assert sidecar["manifest"]["sha256"] == digest
    assert sidecar["elements"][0]["visual_review"] is not None
    assert (
        result.evidence_root / sidecar["elements"][0]["element_id"] / "full_page_original.png"
    ).exists()
    assert quality["dangerous_quantitative_errors_accepted_without_alert"] is None


def test_inspection_command_preserves_pdf_and_writes_separate_packet(tmp_path: Path) -> None:
    pdf = tmp_path / "technical.pdf"
    _make_native_pdf(pdf)
    digest = sha256_file(pdf)

    packet = inspect_pdf_element(
        pdf,
        1,
        tmp_path / "inspection",
        dpi=200,
        include_context=False,
    )

    assert sha256_file(pdf) == digest
    assert (packet / "full_page_original.png").exists()
    assert (packet / "element_crop_normalized.png").exists()
    assert (packet / "inspection.json").exists()
    assert not list(tmp_path.rglob("*.md"))


def test_pipeline_generates_fallback_request_when_visual_review_fails(tmp_path: Path) -> None:
    pdf = tmp_path / "technical.pdf"
    _make_native_pdf(pdf)
    result = TechnicalPdfEvidencePipeline(reviewer=_FailingReviewer()).run(pdf, tmp_path / "failed")
    sidecar = json.loads(result.sidecar_path.read_text(encoding="utf-8"))
    first = sidecar["elements"][0]
    packet = result.evidence_root / first["element_id"]

    assert first["status"] == "human_review_required"
    fallback = json.loads((packet / "fallback_request.json").read_text(encoding="utf-8"))
    assert "./pdf-evidence inspect" in fallback["inspection_command"]


def test_pipeline_opens_quota_circuit_after_first_failed_review(tmp_path: Path) -> None:
    pdf = tmp_path / "technical.pdf"
    document = fitz.open()
    for number in (1, 2):
        page = document.new_page(width=612, height=792)
        page.insert_text((48, 90), f"Table 1-{number}: Position Greeks", fontsize=14)
        page.insert_text((70, 130), "Metric      Value", fontsize=12)
        page.insert_text((70, 155), "Theta       -.0060", fontsize=12)
        page.insert_text((70, 180), "Vega        .100", fontsize=12)
    document.save(pdf)
    document.close()
    reviewer = _QuotaReviewer()

    result = TechnicalPdfEvidencePipeline(reviewer=reviewer, max_visual_calls=40).run(
        pdf, tmp_path / "quota"
    )
    sidecar = json.loads(result.sidecar_path.read_text(encoding="utf-8"))
    quality = json.loads(result.quality_report_path.read_text(encoding="utf-8"))

    assert len(sidecar["elements"]) >= 2
    assert reviewer.calls == 1
    assert result.gemini_calls == 1
    assert result.gemini_failures == 1
    assert result.gemini_circuit_open is True
    assert quality["gemini_circuit_reason"] == "quota_exhausted"
    assert "gemini_visual_review_quota_exhausted" in sidecar["elements"][1]["alerts"]


class _AmbiguousReviewer:
    def review(self, element: DetectedElement, _packet: Path) -> dict[str, object]:
        return _review(element, ambiguous_regions=[{"bbox": [1, 2, 3, 4]}])


def test_pipeline_generates_fallback_request_for_unresolved_visual_review(
    tmp_path: Path,
) -> None:
    pdf = tmp_path / "technical.pdf"
    _make_native_pdf(pdf)
    result = TechnicalPdfEvidencePipeline(reviewer=_AmbiguousReviewer()).run(
        pdf, tmp_path / "ambiguous"
    )
    sidecar = json.loads(result.sidecar_path.read_text(encoding="utf-8"))
    first = sidecar["elements"][0]
    packet = result.evidence_root / first["element_id"]

    assert first["status"] == "needs_visual_review"
    assert (packet / "fallback_request.json").exists()


@pytest.mark.skipif(shutil.which("tesseract") is None, reason="Tesseract is unavailable")
def test_scanned_page_uses_local_ocr_before_detection(tmp_path: Path) -> None:
    pdf = tmp_path / "scan.pdf"
    _make_scanned_pdf(pdf, tmp_path)

    result = TechnicalPdfEvidencePipeline(
        visual_review_enabled=False,
        reviewer=None,
        dpi=200,
    ).run(pdf, tmp_path / "scan-result")
    quality = json.loads(result.quality_report_path.read_text(encoding="utf-8"))
    sidecar = json.loads(result.sidecar_path.read_text(encoding="utf-8"))

    assert quality["ocr_pages"] == 1
    assert sidecar["elements"]
    assert sidecar["elements"][0]["text_source"] == "tesseract_ocr"


class _RepairingClient:
    def __init__(self, valid: dict[str, object], *, invalid_json: bool = False) -> None:
        self.valid = valid
        self.invalid_json = invalid_json
        self.calls = 0

    def generate_multimodal_json(self, *_args: object) -> dict[str, object]:
        self.calls += 1
        if self.calls == 1 and self.invalid_json:
            raise GeminiInvalidJsonError("simulated invalid Gemini JSON")
        return {"invalid": True} if self.calls == 1 else self.valid


def test_gemini_reviewer_attempts_one_structured_repair(tmp_path: Path) -> None:
    element = _element()
    packet = tmp_path / "packet"
    packet.mkdir()
    (packet / "full_page_original.png").write_bytes(b"image")
    (packet / "element_crop_normalized.png").write_bytes(b"image")
    (packet / "metadata.json").write_text("{}", encoding="utf-8")
    (packet / "extraction_candidate.json").write_text("{}", encoding="utf-8")
    prompt = tmp_path / "prompt.md"
    prompt.write_text("Return JSON.", encoding="utf-8")
    client = _RepairingClient(_review(element))
    reviewer = GeminiVisualReviewer(
        client,  # type: ignore[arg-type]
        ModelConfig("test", "test", 1000, 1000, 0.0),
        prompt,
    )

    result = reviewer.review(element, packet)

    assert result["element_id"] == element.element_id
    assert client.calls == 2
    metadata = json.loads((packet / "gemini_review_metadata.json").read_text())
    assert metadata["repair_attempted"] is True


def test_gemini_reviewer_repairs_invalid_json_once(tmp_path: Path) -> None:
    element = _element()
    packet = tmp_path / "packet"
    packet.mkdir()
    (packet / "full_page_original.png").write_bytes(b"image")
    (packet / "element_crop_normalized.png").write_bytes(b"image")
    (packet / "metadata.json").write_text("{}", encoding="utf-8")
    (packet / "extraction_candidate.json").write_text("{}", encoding="utf-8")
    prompt = tmp_path / "prompt.md"
    prompt.write_text("Return JSON.", encoding="utf-8")
    client = _RepairingClient(_review(element), invalid_json=True)
    reviewer = GeminiVisualReviewer(
        client,  # type: ignore[arg-type]
        ModelConfig("test", "test", 1000, 1000, 0.0),
        prompt,
    )

    result = reviewer.review(element, packet)

    assert result["element_id"] == element.element_id
    assert client.calls == 2
