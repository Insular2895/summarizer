from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import fitz
import pytest

from src.pdf_evidence.core import sha256_file, write_json
from src.pdf_evidence.golden import evaluate_sidecar_against_golden_set
from src.pdf_evidence.resolution import apply_human_review


def _source_pdf(path: Path) -> None:
    document = fitz.open()
    page = document.new_page(width=300, height=300)
    page.insert_text((30, 50), "Theta -0.50")
    document.save(path)
    document.close()


def _structure() -> dict[str, Any]:
    return {
        "caption": "Figure 13.1 Greeks for 20-Lot Delta-Neutral Long Call",
        "content": [
            {
                "type": "table",
                "headers": ["Greek", "Value"],
                "data": [
                    ["Delta", "0"],
                    ["Gamma", "+2.80"],
                    ["Theta", "-0.50"],
                    ["Vega", "+1.15"],
                ],
            }
        ],
    }


def _sidecar(source: Path) -> dict[str, Any]:
    return {
        "schema_version": "2.0",
        "manifest": {
            "document_id": "passarelli-test",
            "source_file": str(source),
            "sha256": sha256_file(source),
            "page_count": 1,
            "pipeline_version": "pdf-evidence-v2",
        },
        "pages_analyzed": 1,
        "elements": [
            {
                "element_id": "p000001-figure-13-1",
                "element_type": "figure",
                "page": {
                    "pdf_page_number": 1,
                    "printed_page_normalized": 249,
                },
                "bbox": [0, 0, 100, 100],
                "raw_text": "Theta +0.50",
                "extraction_candidate": {"raw_ocr": "Theta +0.50"},
                "visual_review": {"structure": _structure()},
                "confidence": {"numeric": 0.5},
                "alerts": ["sign_disagreement"],
                "status": "blocked",
                "text_source": "ocr",
                "data_digitized": False,
            }
        ],
    }


def _review(source: Path, evidence: Path) -> dict[str, Any]:
    return {
        "schema_version": "1.0",
        "review_id": "passarelli-figure-13-1-user-review-v1",
        "document_sha256": sha256_file(source),
        "element_id": "p000001-figure-13-1",
        "reviewer": {"type": "human", "name": "user"},
        "decision": "approve_corrected_structure",
        "corrected_structure": _structure(),
        "corrected_page": {
            "pdf_page_number": 1,
            "printed_page_normalized": 249,
        },
        "evidence_files": [str(evidence)],
        "notes": "The source image visibly reads Theta -0.50.",
        "reviewed_at": "2026-07-16T12:00:00+02:00",
    }


def test_human_review_creates_corrected_canonical_outputs_without_overwrite(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source.pdf"
    _source_pdf(source)
    evidence = tmp_path / "crop.png"
    evidence.write_bytes(b"visual evidence")
    sidecar_path = write_json(tmp_path / "book.sidecar.json", _sidecar(source))
    review_path = write_json(tmp_path / "human_review.json", _review(source, evidence))
    original_sidecar = sidecar_path.read_bytes()

    resolved_path, markdown_path = apply_human_review(sidecar_path, review_path)

    assert sidecar_path.read_bytes() == original_sidecar
    assert resolved_path != sidecar_path
    resolved = json.loads(resolved_path.read_text(encoding="utf-8"))
    element = resolved["elements"][0]
    assert element["raw_text"] == "Theta +0.50"
    assert element["extraction_candidate"]["raw_ocr"] == "Theta +0.50"
    assert element["canonical_extraction"]["structure"] == _structure()
    assert element["canonical_extraction"]["page"]["printed_page_normalized"] == 249
    assert element["status"] == "human_verified"
    assert element["data_digitized"] is True
    markdown = markdown_path.read_text(encoding="utf-8")
    assert "| Theta | -0.50 |" in markdown
    assert "Page imprimée : 249" in markdown
    assert "Theta +0.50" not in markdown


def test_machine_or_gemini_cannot_promote_critical_content(tmp_path: Path) -> None:
    source = tmp_path / "source.pdf"
    _source_pdf(source)
    evidence = tmp_path / "crop.png"
    evidence.write_bytes(b"visual evidence")
    sidecar_path = write_json(tmp_path / "book.sidecar.json", _sidecar(source))
    review = _review(source, evidence)
    review["reviewer"] = {"type": "gemini", "name": "gemini"}
    review_path = write_json(tmp_path / "gemini_review.json", review)

    with pytest.raises(ValueError, match="explicit human review"):
        apply_human_review(sidecar_path, review_path)


def test_review_for_a_different_pdf_hash_is_rejected(tmp_path: Path) -> None:
    source = tmp_path / "source.pdf"
    _source_pdf(source)
    evidence = tmp_path / "crop.png"
    evidence.write_bytes(b"visual evidence")
    sidecar_path = write_json(tmp_path / "book.sidecar.json", _sidecar(source))
    review = _review(source, evidence)
    review["document_sha256"] = "0" * 64
    review_path = write_json(tmp_path / "wrong_source_review.json", review)

    with pytest.raises(ValueError, match="different PDF hashes"):
        apply_human_review(sidecar_path, review_path)


def test_golden_scoring_uses_only_human_verified_canonical_values(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source.pdf"
    _source_pdf(source)
    evidence = tmp_path / "crop.png"
    evidence.write_bytes(b"visual evidence")
    sidecar = _sidecar(source)
    sidecar_path = write_json(tmp_path / "book.sidecar.json", sidecar)
    review_path = write_json(tmp_path / "human_review.json", _review(source, evidence))
    resolved_path, _ = apply_human_review(sidecar_path, review_path)
    resolved = json.loads(resolved_path.read_text(encoding="utf-8"))

    annotations = tmp_path / "annotations"
    annotations.mkdir()
    write_json(
        annotations / "source.json",
        {
            "source_sha256": sha256_file(source),
            "cases": [
                {
                    "id": "theta",
                    "pdf_page_number": 1,
                    "critical": True,
                    "element_match": {"element_id": "p000001-figure-13-1"},
                    "assertions": [
                        {
                            "id": "theta-sign",
                            "kind": "quantitative_token",
                            "expected": "-0.50",
                            "quantitative": True,
                        }
                    ],
                }
            ],
        },
    )

    report = evaluate_sidecar_against_golden_set(resolved, annotations)

    assert report["critical_assertions_trusted"] == 1
    assert report["dangerous_quantitative_errors_accepted_without_alert"] == 0
    assert report["dangerous_error_metric_status"] == "pass"


def test_original_extraction_is_not_mutated_in_memory(tmp_path: Path) -> None:
    source = tmp_path / "source.pdf"
    _source_pdf(source)
    evidence = tmp_path / "crop.png"
    evidence.write_bytes(b"visual evidence")
    sidecar = _sidecar(source)
    expected = copy.deepcopy(sidecar)
    sidecar_path = write_json(tmp_path / "book.sidecar.json", sidecar)
    review_path = write_json(tmp_path / "human_review.json", _review(source, evidence))

    apply_human_review(sidecar_path, review_path)

    assert sidecar == expected
