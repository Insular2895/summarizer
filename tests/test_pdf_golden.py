from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from src.pdf_evidence.golden import evaluate_sidecar_against_golden_set


def _write_annotation(
    directory: Path,
    assertion: dict[str, Any],
    *,
    element_type: str = "figure",
) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "source.json").write_text(
        json.dumps(
            {
                "source_sha256": "golden-sha",
                "cases": [
                    {
                        "id": "GOLDEN-1",
                        "pdf_page_number": 1,
                        "critical": True,
                        "element_match": {"element_type": element_type},
                        "assertions": [assertion],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )


def _sidecar(
    *,
    raw_text: str = "Delta 0",
    status: str = "human_verified",
    alerts: list[str] | None = None,
    include_element: bool = True,
    data_digitized: bool = False,
) -> dict[str, Any]:
    elements: list[dict[str, Any]] = []
    if include_element:
        elements.append(
            {
                "element_id": "p000001-figure-13-1",
                "element_type": "figure",
                "page": {"pdf_page_number": 1},
                "raw_text": raw_text,
                "extraction_candidate": {"raw_ocr": raw_text},
                "visual_review": None,
                "status": status,
                "alerts": alerts or [],
                "data_digitized": data_digitized,
            }
        )
    return {
        "manifest": {"sha256": "golden-sha"},
        "pages_analyzed": 1,
        "elements": elements,
    }


def test_correct_human_verified_quantitative_value_passes(tmp_path: Path) -> None:
    _write_annotation(
        tmp_path,
        {
            "id": "gamma",
            "kind": "quantitative_token",
            "expected": "+2.80",
            "quantitative": True,
        },
    )

    report = evaluate_sidecar_against_golden_set(_sidecar(raw_text="Gamma +2.80"), tmp_path)

    assert report["dangerous_quantitative_errors_accepted_without_alert"] == 0
    assert report["trusted_coverage"] == 1.0
    assert report["dangerous_error_metric_status"] == "pass"


def test_wrong_trusted_sign_is_a_dangerous_silent_error(tmp_path: Path) -> None:
    _write_annotation(
        tmp_path,
        {
            "id": "gamma",
            "kind": "quantitative_token",
            "expected": "+2.80",
            "quantitative": True,
        },
    )

    report = evaluate_sidecar_against_golden_set(_sidecar(raw_text="Gamma 2.80"), tmp_path)

    assert report["dangerous_quantitative_errors_accepted_without_alert"] == 1
    assert report["unsafe_assertions_accepted_without_alert"] == 1
    assert report["dangerous_error_metric_status"] == "fail"


def test_wrong_blocked_value_is_safe_but_not_counted_as_validated(tmp_path: Path) -> None:
    _write_annotation(
        tmp_path,
        {
            "id": "theta",
            "kind": "quantitative_token",
            "expected": "-0.50",
            "quantitative": True,
        },
    )

    report = evaluate_sidecar_against_golden_set(
        _sidecar(raw_text="Theta +0.50", status="blocked"), tmp_path
    )

    assert report["dangerous_quantitative_errors_accepted_without_alert"] == 0
    assert report["alerted_errors_or_omissions"] == 1
    assert report["trusted_coverage"] == 0.0
    assert report["dangerous_error_metric_status"] == "safe_but_incomplete"


def test_missing_critical_element_fails_even_without_a_wrong_value(tmp_path: Path) -> None:
    _write_annotation(
        tmp_path,
        {
            "id": "present",
            "kind": "element_present",
            "expected": True,
            "quantitative": False,
        },
    )

    report = evaluate_sidecar_against_golden_set(_sidecar(include_element=False), tmp_path)

    assert report["critical_elements_missing_without_alert"] == 1
    assert report["dangerous_error_metric_status"] == "fail"


def test_identifiers_and_page_numbers_cannot_fake_delta_zero(tmp_path: Path) -> None:
    _write_annotation(
        tmp_path,
        {
            "id": "delta",
            "kind": "quantitative_token",
            "expected": "0",
            "quantitative": True,
        },
    )

    report = evaluate_sidecar_against_golden_set(_sidecar(raw_text="Delta unreadable"), tmp_path)

    assert report["dangerous_quantitative_errors_accepted_without_alert"] == 1


def test_silently_digitized_chart_is_an_unsafe_nonquantitative_failure(
    tmp_path: Path,
) -> None:
    _write_annotation(
        tmp_path,
        {
            "id": "not_digitized",
            "kind": "data_digitized",
            "expected": False,
            "quantitative": False,
        },
    )

    report = evaluate_sidecar_against_golden_set(_sidecar(data_digitized=True), tmp_path)

    assert report["dangerous_quantitative_errors_accepted_without_alert"] == 0
    assert report["unsafe_assertions_accepted_without_alert"] == 1
    assert report["dangerous_error_metric_status"] == "fail"
