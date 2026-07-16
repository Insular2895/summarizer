from __future__ import annotations

import json
import re
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from src.pdf_evidence.core import read_json

TRUSTED_STATUSES = {
    "machine_verified",
    "machine_verified_with_visual_check",
    "machine_reviewed",
    "human_verified",
}
CONSERVATIVE_STATUSES = {
    "needs_visual_review",
    "human_review_required",
    "blocked",
    "unextractable",
    "image_only",
}
NUMBER_TOKEN_RE = re.compile(
    r"(?<![A-Za-z0-9_.])[+$\-−]?\s*(?:\d{1,3}(?:[ ,]\d{3})+(?:[.,]\d+)?|"
    r"\d+(?:[.,]\d+)?|[.,]\d+|\d+\s*/\s*\d+)(?![A-Za-z0-9_.])"
)


@dataclass(frozen=True)
class GoldenAnnotation:
    path: Path
    payload: dict[str, Any]


def evaluate_sidecar_against_golden_set(
    sidecar: dict[str, Any],
    annotation_dir: Path,
) -> dict[str, Any]:
    """Measure dangerous silent errors against human-authored references.

    The metric deliberately separates safety from coverage. Blocking an
    uncertain value is safe, but it is not the same as extracting it correctly.
    """
    source_sha256 = str(sidecar.get("manifest", {}).get("sha256", ""))
    annotation = _find_annotation(annotation_dir, source_sha256)
    if annotation is None:
        return _not_applicable("no_matching_annotation")

    pages_analyzed = int(sidecar.get("pages_analyzed", 0))
    cases = [
        case
        for case in annotation.payload.get("cases", [])
        if int(case.get("pdf_page_number", 0)) <= pages_analyzed
    ]
    if not cases:
        return _not_applicable("annotations_outside_page_range", annotation.path)

    elements = [value for value in sidecar.get("elements", []) if isinstance(value, dict)]
    assertion_total = 0
    assertion_correct = 0
    assertion_trusted = 0
    missing_or_wrong = 0
    dangerous = 0
    unsafe_accepted = 0
    alerted = 0
    critical_elements_missing = 0
    case_results: list[dict[str, Any]] = []

    for case in cases:
        assertions = [value for value in case.get("assertions", []) if isinstance(value, dict)]
        assertion_total += len(assertions)
        element = _best_matching_element(elements, case)
        if element is None:
            missing_or_wrong += len(assertions)
            if case.get("critical", True):
                critical_elements_missing += 1
            case_results.append(
                {
                    "case_id": case.get("id"),
                    "pdf_page_number": case.get("pdf_page_number"),
                    "element_id": None,
                    "status": "missing_critical_element",
                    "assertions": [
                        {
                            "id": item.get("id"),
                            "correct": False,
                            "classification": "missing_without_alert",
                        }
                        for item in assertions
                    ],
                }
            )
            continue

        element_status = str(element.get("status", ""))
        trusted = element_status in TRUSTED_STATUSES
        conservative = element_status in CONSERVATIVE_STATUSES or bool(element.get("alerts"))
        assertion_results: list[dict[str, Any]] = []
        for assertion in assertions:
            correct, observed = _evaluate_assertion(element, assertion)
            if correct:
                assertion_correct += 1
                if trusted:
                    assertion_trusted += 1
                classification = "correct_trusted" if trusted else "correct_but_unverified"
            else:
                missing_or_wrong += 1
                if trusted or not conservative:
                    unsafe_accepted += 1
                    dangerous += int(assertion.get("quantitative", False))
                    classification = "dangerous_accepted_without_alert"
                else:
                    alerted += 1
                    classification = "error_or_omission_alerted"
            assertion_results.append(
                {
                    "id": assertion.get("id"),
                    "correct": correct,
                    "classification": classification,
                    "observed": observed,
                    "expected": assertion.get("expected"),
                }
            )

        if any(
            item["classification"] == "dangerous_accepted_without_alert"
            for item in assertion_results
        ):
            case_status = "fail"
        elif all(item["classification"] == "correct_trusted" for item in assertion_results):
            case_status = "pass"
        else:
            case_status = "safe_but_incomplete"
        case_results.append(
            {
                "case_id": case.get("id"),
                "pdf_page_number": case.get("pdf_page_number"),
                "element_id": element.get("element_id"),
                "element_status": element_status,
                "status": case_status,
                "assertions": assertion_results,
            }
        )

    if unsafe_accepted or critical_elements_missing:
        metric_status = "fail"
    elif missing_or_wrong or assertion_trusted < assertion_total:
        metric_status = "safe_but_incomplete"
    else:
        metric_status = "pass"

    return {
        "golden_annotation": str(annotation.path),
        "golden_cases_evaluated": len(cases),
        "critical_assertions_total": assertion_total,
        "critical_assertions_correct": assertion_correct,
        "critical_assertions_missing_or_wrong": missing_or_wrong,
        "critical_assertions_trusted": assertion_trusted,
        "trusted_coverage": _ratio(assertion_trusted, assertion_total),
        "dangerous_quantitative_errors_accepted_without_alert": dangerous,
        "dangerous_acceptance_rate": _ratio(dangerous, assertion_total),
        "unsafe_assertions_accepted_without_alert": unsafe_accepted,
        "alerted_errors_or_omissions": alerted,
        "critical_elements_missing_without_alert": critical_elements_missing,
        "dangerous_error_metric_status": metric_status,
        "golden_case_results": case_results,
    }


def evaluate_sidecar_file(sidecar_path: Path, annotation_dir: Path) -> dict[str, Any]:
    return evaluate_sidecar_against_golden_set(read_json(sidecar_path), annotation_dir)


def _find_annotation(annotation_dir: Path, source_sha256: str) -> GoldenAnnotation | None:
    if not annotation_dir.exists() or not source_sha256:
        return None
    for path in sorted(annotation_dir.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(payload, dict) and payload.get("source_sha256") == source_sha256:
            return GoldenAnnotation(path=path, payload=payload)
    return None


def _best_matching_element(
    elements: list[dict[str, Any]], case: dict[str, Any]
) -> dict[str, Any] | None:
    matcher = case.get("element_match", {})
    page_number = int(case.get("pdf_page_number", 0))
    candidates = [
        element
        for element in elements
        if int(element.get("page", {}).get("pdf_page_number", 0)) == page_number
    ]
    element_id = matcher.get("element_id")
    if element_id:
        exact = [element for element in candidates if element.get("element_id") == element_id]
        if exact:
            candidates = exact
    element_type = matcher.get("element_type")
    if element_type:
        candidates = [
            element for element in candidates if element.get("element_type") == element_type
        ]
    figure_number = matcher.get("figure_number")
    if figure_number:
        candidates = [
            element for element in candidates if element.get("figure_number") == figure_number
        ]
    table_number = matcher.get("table_number")
    if table_number:
        candidates = [
            element for element in candidates if element.get("table_number") == table_number
        ]
    required_text = str(matcher.get("raw_text_contains", "")).casefold()
    if required_text:
        candidates = [
            element
            for element in candidates
            if required_text in str(element.get("raw_text", "")).casefold()
        ]
    return candidates[0] if candidates else None


def _evaluate_assertion(element: dict[str, Any], assertion: dict[str, Any]) -> tuple[bool, Any]:
    kind = assertion.get("kind")
    if kind == "element_present":
        return True, element.get("element_id")
    if kind == "data_digitized":
        observed = element.get("data_digitized")
        return observed is assertion.get("expected"), observed
    if kind == "text_contains":
        observed = _element_content_text(element)
        expected = str(assertion.get("expected", ""))
        return expected.casefold() in observed.casefold(), observed[:240]
    if kind == "quantitative_token":
        observed_tokens = list(_quantitative_tokens(_element_content_text(element)))
        aliases = [str(assertion.get("expected", ""))] + [
            str(value) for value in assertion.get("aliases", [])
        ]
        expected_tokens = {_canonical_number_token(value) for value in aliases}
        expected_tokens.discard("")
        return bool(expected_tokens.intersection(observed_tokens)), observed_tokens
    raise ValueError(f"Unknown golden assertion kind: {kind}")


def _flatten_text(value: Any) -> str:
    parts: list[str] = []

    def visit(item: Any) -> None:
        if isinstance(item, dict):
            for key, child in item.items():
                if key not in {"bbox", "confidence"}:
                    visit(child)
        elif isinstance(item, list):
            for child in item:
                visit(child)
        elif isinstance(item, (str, int, float)) and not isinstance(item, bool):
            parts.append(str(item))

    visit(value)
    return "\n".join(parts)


def _element_content_text(element: dict[str, Any]) -> str:
    """Flatten only visible/candidate content, never identifiers or pagination.

    Page numbers and element identifiers contain many zeroes. Including them in
    the token stream could make a missing ``Delta 0`` look correct even when the
    actual figure contents were never extracted.

    Once a human-approved canonical extraction exists, it becomes the only
    content scored. Raw OCR and Gemini candidates remain auditable in the
    sidecar but cannot reintroduce a wrong sign into the validated value stream.
    """
    canonical = element.get("canonical_extraction")
    if element.get("status") == "human_verified" and isinstance(canonical, dict):
        return _flatten_text(canonical.get("structure"))
    return _flatten_text(
        {
            "raw_text": element.get("raw_text"),
            "extraction_candidate": element.get("extraction_candidate"),
            "visual_review": element.get("visual_review"),
        }
    )


def _quantitative_tokens(text: str) -> Iterable[str]:
    for match in NUMBER_TOKEN_RE.finditer(text.replace("−", "-")):
        token = _canonical_number_token(match.group(0))
        if token:
            yield token


def _canonical_number_token(value: str) -> str:
    token = value.strip().replace("−", "-").replace(" ", "")
    token = re.sub(r"(?<=\d),(?=\d{3}(?:\D|$))", "", token)
    token = token.replace(",", ".")
    if token.startswith("$-"):
        token = "-$" + token[2:]
    return token


def _ratio(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 6) if denominator else None


def _not_applicable(reason: str, annotation: Path | None = None) -> dict[str, Any]:
    return {
        "golden_annotation": str(annotation) if annotation else None,
        "golden_cases_evaluated": 0,
        "critical_assertions_total": 0,
        "critical_assertions_correct": 0,
        "critical_assertions_missing_or_wrong": 0,
        "critical_assertions_trusted": 0,
        "trusted_coverage": None,
        "dangerous_quantitative_errors_accepted_without_alert": None,
        "dangerous_acceptance_rate": None,
        "unsafe_assertions_accepted_without_alert": None,
        "alerted_errors_or_omissions": 0,
        "critical_elements_missing_without_alert": 0,
        "dangerous_error_metric_status": f"not_applicable_{reason}",
        "golden_case_results": [],
    }
