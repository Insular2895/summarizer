from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Any

from src.pdf_evidence.core import DetectedElement, ElementType, ReviewStatus

REQUIRED_VISUAL_REVIEW_KEYS = {
    "element_id",
    "media_readable",
    "observed_type",
    "observed_rotation",
    "structure",
    "disagreements",
    "ambiguous_regions",
    "missing_context",
    "confidence",
    "recommended_status",
}
REQUIRED_CONFIDENCE_KEYS = {
    "visual_readability",
    "table_structure",
    "numeric",
    "formula",
}
REQUIRED_DISAGREEMENT_KEYS = {
    "location",
    "ocr_value",
    "visual_candidates",
    "preferred_candidate",
    "confidence",
    "reason",
}
ALLOWED_OBSERVED_TYPES = {element_type.value for element_type in ElementType} | {
    "non_technical",
    "text",
    "text_block",
    "paragraph",
}
ALLOWED_RECOMMENDATIONS = {
    ReviewStatus.MACHINE_VERIFIED_WITH_VISUAL_CHECK.value,
    ReviewStatus.NEEDS_VISUAL_REVIEW.value,
    ReviewStatus.HUMAN_REVIEW_REQUIRED.value,
    ReviewStatus.BLOCKED.value,
    ReviewStatus.IMAGE_ONLY.value,
}
CRITICAL_TOKENS = ("sign", "decimal", "column", "formula", "break-even", "greek", "payoff")
ARITHMETIC_RE = re.compile(
    r"(?P<left>[+\-−]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*"
    r"(?P<operator>[xX×*])\s*"
    r"(?P<right>[+\-−]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*"
    r"=\s*(?P<result>[+\-−]?(?:\d+(?:[.,]\d+)?|[.,]\d+))"
)


def validate_visual_review_response(value: dict[str, Any], element_id: str) -> None:
    missing = REQUIRED_VISUAL_REVIEW_KEYS - value.keys()
    if missing:
        raise ValueError(f"Gemini JSON is missing required keys: {sorted(missing)}")
    extra = value.keys() - REQUIRED_VISUAL_REVIEW_KEYS
    if extra:
        raise ValueError(f"Gemini JSON has unexpected keys: {sorted(extra)}")
    if value["element_id"] != element_id:
        raise ValueError(f"Gemini reviewed {value['element_id']!r}, expected {element_id!r}")
    if not isinstance(value["media_readable"], bool):
        raise ValueError("media_readable must be a boolean")
    if not isinstance(value["disagreements"], list):
        raise ValueError("disagreements must be a list")
    if value["observed_type"] not in ALLOWED_OBSERVED_TYPES:
        raise ValueError(f"Unsupported observed_type: {value['observed_type']!r}")
    if value["observed_rotation"] not in {0, 90, 180, 270}:
        raise ValueError("observed_rotation must be 0, 90, 180, or 270")
    if not isinstance(value["structure"], dict):
        raise ValueError("structure must be an object")
    for key in ("ambiguous_regions", "missing_context"):
        if not isinstance(value[key], list):
            raise ValueError(f"{key} must be a list")
    if value["recommended_status"] not in ALLOWED_RECOMMENDATIONS:
        raise ValueError(f"Unsupported recommended_status: {value['recommended_status']!r}")
    if not isinstance(value["confidence"], dict):
        raise ValueError("confidence must be an object")
    confidence_keys = set(value["confidence"])
    if confidence_keys != REQUIRED_CONFIDENCE_KEYS:
        raise ValueError(
            "confidence must contain exactly: " + ", ".join(sorted(REQUIRED_CONFIDENCE_KEYS))
        )
    for key, confidence in value["confidence"].items():
        if confidence is not None and (
            isinstance(confidence, bool)
            or not isinstance(confidence, (int, float))
            or not 0 <= confidence <= 1
        ):
            raise ValueError(f"confidence.{key} must be null or a number from 0 to 1")
    for index, disagreement in enumerate(value["disagreements"]):
        if not isinstance(disagreement, dict):
            raise ValueError(f"disagreements[{index}] must be an object")
        keys = set(disagreement)
        if keys != REQUIRED_DISAGREEMENT_KEYS:
            raise ValueError(
                f"disagreements[{index}] must contain exactly: "
                + ", ".join(sorted(REQUIRED_DISAGREEMENT_KEYS))
            )
        if not isinstance(disagreement["visual_candidates"], list):
            raise ValueError(f"disagreements[{index}].visual_candidates must be a list")
        confidence = disagreement["confidence"]
        if (
            isinstance(confidence, bool)
            or not isinstance(confidence, (int, float))
            or not 0 <= confidence <= 1
        ):
            raise ValueError(f"disagreements[{index}].confidence must be from 0 to 1")


def status_after_visual_review(element: DetectedElement, review: dict[str, Any]) -> ReviewStatus:
    # A visual model may add evidence, but it must never override a failed
    # deterministic control such as a column shift or arithmetic mismatch.
    if element.status == ReviewStatus.BLOCKED:
        return ReviewStatus.BLOCKED
    if not review.get("media_readable"):
        return ReviewStatus.HUMAN_REVIEW_REQUIRED
    if review.get("observed_type") != element.element_type.value:
        return ReviewStatus.NEEDS_VISUAL_REVIEW
    if any(
        alert in element.alerts
        for alert in {
            "external_annotations_detected",
            "scan_skew_detected",
            "table_continued_requires_context",
            "figure_caption_on_previous_page",
        }
    ):
        return ReviewStatus.NEEDS_VISUAL_REVIEW
    recommendation = str(review.get("recommended_status", ""))
    if recommendation == ReviewStatus.BLOCKED.value:
        return ReviewStatus.BLOCKED
    if recommendation == ReviewStatus.HUMAN_REVIEW_REQUIRED.value:
        return ReviewStatus.HUMAN_REVIEW_REQUIRED
    if element.element_type in {
        ElementType.FIGURE,
        ElementType.CHART,
        ElementType.PAYOFF_DIAGRAM,
    }:
        return ReviewStatus.IMAGE_ONLY
    disagreements = review.get("disagreements", [])
    for disagreement in disagreements:
        serialized = str(disagreement).lower()
        if any(token in serialized for token in CRITICAL_TOKENS):
            return ReviewStatus.BLOCKED
        if _numeric_signature(str(disagreement.get("ocr_value", ""))) != _numeric_signature(
            str(disagreement.get("preferred_candidate", ""))
        ):
            return ReviewStatus.BLOCKED
    if disagreements or review.get("ambiguous_regions") or review.get("missing_context"):
        return ReviewStatus.NEEDS_VISUAL_REVIEW
    if recommendation == ReviewStatus.NEEDS_VISUAL_REVIEW.value:
        return ReviewStatus.NEEDS_VISUAL_REVIEW

    confidence = review.get("confidence", {})
    numeric = confidence.get("numeric")
    structure = confidence.get("table_structure")
    formula = confidence.get("formula")
    if numeric is not None and float(numeric) < 0.95:
        return ReviewStatus.NEEDS_VISUAL_REVIEW
    if structure is not None and float(structure) < 0.90:
        return ReviewStatus.NEEDS_VISUAL_REVIEW
    if formula is not None and float(formula) < 0.90:
        return ReviewStatus.NEEDS_VISUAL_REVIEW

    structure_value = review.get("structure")
    if element.element_type == ElementType.TABLE and (
        not isinstance(structure_value, dict) or not structure_value.get("rows")
    ):
        return ReviewStatus.NEEDS_VISUAL_REVIEW
    if element.element_type == ElementType.FORMULA and (
        not isinstance(structure_value, dict)
        or not any(
            structure_value.get(key)
            for key in ("latex_candidate", "plain_text_candidate", "formula")
        )
    ):
        return ReviewStatus.NEEDS_VISUAL_REVIEW

    return ReviewStatus.MACHINE_VERIFIED_WITH_VISUAL_CHECK


def run_deterministic_checks(element: DetectedElement) -> list[str]:
    """Apply conservative structural and arithmetic checks in place."""
    alerts: list[str] = []
    if element.element_type == ElementType.TABLE:
        candidate = element.extraction_candidate
        columns = candidate.get("columns")
        rows = candidate.get("rows")
        if isinstance(columns, int) and isinstance(rows, list):
            if any(not isinstance(row, list) or len(row) != columns for row in rows):
                alerts.append("column_shift_risk")
        elif candidate and "raw_ocr" not in candidate:
            alerts.append("table_structure_missing")
    if element.element_type == ElementType.FORMULA:
        candidate = element.extraction_candidate
        if not any(
            candidate.get(key) for key in ("latex_candidate", "plain_text_candidate", "formula")
        ):
            alerts.append("formula_structure_ambiguous")

    alerts.extend(check_arithmetic_expressions(element.raw_text))
    alerts = sorted(set(alerts))
    for alert in alerts:
        if alert not in element.alerts:
            element.alerts.append(alert)
    if any(alert in {"column_shift_risk", "arithmetic_check_failed"} for alert in alerts):
        element.status = ReviewStatus.BLOCKED
    return alerts


def check_arithmetic_expressions(text: str) -> list[str]:
    """Verify explicit multiplication equalities visible in extracted text."""
    alerts: list[str] = []
    for match in ARITHMETIC_RE.finditer(text):
        try:
            left = _decimal(match.group("left"))
            right = _decimal(match.group("right"))
            observed = _decimal(match.group("result"))
        except InvalidOperation:
            continue
        expected = left * right
        precision = max(0, -observed.as_tuple().exponent)
        tolerance = Decimal("1").scaleb(-precision) / 2
        if abs(expected - observed) > tolerance:
            alerts.append("arithmetic_check_failed")
    return sorted(set(alerts))


def _numeric_signature(value: str) -> list[str]:
    return [
        token.replace("−", "-").replace(",", ".").replace(" ", "")
        for token in re.findall(r"[+\-−]?\s*(?:\d+(?:[.,]\d+)?|[.,]\d+|\d+\s*/\s*\d+)", value)
    ]


def _decimal(value: str) -> Decimal:
    return Decimal(value.replace("−", "-").replace(",", ".").replace(" ", ""))
