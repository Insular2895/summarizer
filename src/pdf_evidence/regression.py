from __future__ import annotations

from pathlib import Path
from typing import Any

from src.pdf_evidence.core import read_json

EXPECTED_CASES = {
    "G01": "native_text_clean",
    "G02": "scan_clean",
    "G03": "scan_skewed",
    "G04": "low_contrast",
    "G05": "rotated_table",
    "G06": "multi_level_headers",
    "G07": "signed_decimals",
    "G08": "fractions",
    "G09": "formulas",
    "G10": "payoff_diagram",
    "G11": "multi_series_chart",
    "G12": "external_annotations",
    "G13": "page_number_mismatch",
    "G14": "table_continued",
    "G15": "figure_caption_on_previous_page",
    "G16": "gemini_api_failure",
    "G17": "gemini_invalid_json",
    "G18": "gemini_ocr_disagreement",
    "G19": "codex_media_unavailable",
}


def evaluate_regression_manifest(path: Path) -> dict[str, Any]:
    manifest = read_json(path)
    rows = manifest.get("cases")
    if not isinstance(rows, list):
        raise ValueError("Regression manifest cases must be a list.")
    observed: dict[str, dict[str, Any]] = {}
    errors: list[str] = []
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("id"), str):
            errors.append("invalid_case_row")
            continue
        case_id = row["id"]
        if case_id in observed:
            errors.append(f"duplicate_case:{case_id}")
        observed[case_id] = row
    for case_id, difficulty in EXPECTED_CASES.items():
        row = observed.get(case_id)
        if row is None:
            errors.append(f"missing_case:{case_id}")
            continue
        if row.get("difficulty") != difficulty:
            errors.append(f"difficulty_mismatch:{case_id}")
        if row.get("status") != "covered":
            errors.append(f"not_covered:{case_id}")
        tests = row.get("tests")
        if not isinstance(tests, list) or not tests or not all(isinstance(v, str) for v in tests):
            errors.append(f"missing_tests:{case_id}")
    for case_id in sorted(set(observed) - set(EXPECTED_CASES)):
        errors.append(f"unexpected_case:{case_id}")
    real_cases = sorted(
        case_id
        for case_id, row in observed.items()
        if isinstance(row.get("real_annotations"), list) and row["real_annotations"]
    )
    covered = sorted(set(EXPECTED_CASES) - {error.rsplit(":", 1)[-1] for error in errors})
    return {
        "schema_version": "1.0",
        "status": "pass" if not errors else "fail",
        "cases_expected": len(EXPECTED_CASES),
        "cases_covered": len(covered),
        "synthetic_regression_coverage": len(covered) / len(EXPECTED_CASES),
        "real_source_cases": real_cases,
        "real_source_coverage": len(real_cases) / len(EXPECTED_CASES),
        "errors": errors,
        "important_note": (
            "Synthetic regression coverage proves guardrail behavior. It does not replace "
            "real-page golden annotations or human validation of quantitative values."
        ),
    }
