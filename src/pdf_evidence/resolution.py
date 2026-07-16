from __future__ import annotations

import copy
import json
from datetime import datetime
from pathlib import Path
from typing import Any

from src.pdf_evidence.core import read_json, sha256_file, write_json

APPROVE_DECISION = "approve_corrected_structure"
KEEP_BLOCKED_DECISION = "keep_blocked"
ALLOWED_DECISIONS = {APPROVE_DECISION, KEEP_BLOCKED_DECISION}


def apply_human_review(
    sidecar_path: Path,
    review_path: Path,
    *,
    output_sidecar: Path | None = None,
    output_markdown: Path | None = None,
) -> tuple[Path, Path]:
    """Apply one explicit human review to a new canonical sidecar and Markdown view.

    Raw OCR, the extraction candidate and Gemini's visual review are never replaced.
    The approved reading is added under ``canonical_extraction`` with its provenance.
    """
    sidecar = read_json(sidecar_path)
    review = read_json(review_path)
    _validate_review(sidecar, review, review_path)

    resolved = copy.deepcopy(sidecar)
    element = _find_unique_element(resolved, str(review["element_id"]))
    review_record = _review_record(review, review_path)
    history = element.setdefault("review_history", [])
    if not isinstance(history, list):
        raise ValueError("element.review_history must be a list")
    if any(item.get("review_id") == review["review_id"] for item in history):
        raise ValueError(f"Review {review['review_id']} has already been applied")
    history.append(review_record)

    if review["decision"] == APPROVE_DECISION:
        structure = copy.deepcopy(review["corrected_structure"])
        element["canonical_extraction"] = {
            "status": "human_verified",
            "source": "explicit_human_review",
            "review_id": review["review_id"],
            "reviewed_at": review["reviewed_at"],
            "structure": structure,
        }
        if isinstance(review.get("corrected_page"), dict):
            element["canonical_extraction"]["page"] = copy.deepcopy(review["corrected_page"])
        element["status"] = "human_verified"
        element["data_digitized"] = _contains_quantitative_table(structure)
    else:
        element.pop("canonical_extraction", None)
        element["status"] = "blocked"

    resolved.setdefault("resolution", {})
    resolved["resolution"] = {
        "source_sidecar": str(sidecar_path.resolve()),
        "review_files": [str(review_path.resolve())],
        "canonical_policy": "explicit_human_review_only",
    }

    if output_sidecar is None:
        output_sidecar = _resolved_sidecar_path(sidecar_path)
    if output_markdown is None:
        output_markdown = _verified_markdown_path(sidecar_path)
    if output_sidecar.resolve() == sidecar_path.resolve():
        raise ValueError("Refusing to overwrite the original sidecar")

    write_json(output_sidecar, resolved)
    _write_verified_markdown(output_markdown, resolved)
    return output_sidecar, output_markdown


def create_human_review_template(
    sidecar_path: Path,
    element_id: str,
    *,
    output: Path,
    visual_review_path: Path | None = None,
) -> Path:
    """Create a non-applicable review template from existing visual evidence.

    The template is deliberately left with ``decision=pending``. A human must
    inspect the listed evidence and explicitly approve or block it.
    """
    sidecar = read_json(sidecar_path)
    element = _find_unique_element(sidecar, element_id)
    visual_review = (
        read_json(visual_review_path)
        if visual_review_path is not None
        else element.get("visual_review")
    )
    structure = visual_review.get("structure", {}) if isinstance(visual_review, dict) else {}
    evidence_files = [str(visual_review_path.resolve())] if visual_review_path else []
    template = {
        "schema_version": "1.0",
        "review_id": f"review-{element_id}",
        "document_sha256": sidecar.get("manifest", {}).get("sha256"),
        "element_id": element_id,
        "reviewer": {"type": "human", "name": ""},
        "decision": "pending",
        "corrected_structure": structure,
        "corrected_page": copy.deepcopy(element.get("page", {})),
        "evidence_files": evidence_files,
        "notes": "Inspect every sign, decimal, row and column before approval.",
        "reviewed_at": "",
    }
    return write_json(output, template)


def _validate_review(sidecar: dict[str, Any], review: dict[str, Any], review_path: Path) -> None:
    required = {
        "schema_version",
        "review_id",
        "document_sha256",
        "element_id",
        "reviewer",
        "decision",
        "evidence_files",
        "reviewed_at",
    }
    missing = sorted(required.difference(review))
    if missing:
        raise ValueError(f"Human review is missing fields: {', '.join(missing)}")
    if review["schema_version"] != "1.0":
        raise ValueError("Unsupported human review schema version")
    if review["decision"] not in ALLOWED_DECISIONS:
        raise ValueError(
            f"decision must be one of {sorted(ALLOWED_DECISIONS)}; pending cannot be applied"
        )
    reviewer = review["reviewer"]
    if not isinstance(reviewer, dict) or reviewer.get("type") != "human":
        raise ValueError("Only an explicit human review can promote critical content")
    if not str(reviewer.get("name", "")).strip():
        raise ValueError("reviewer.name is required")
    if not str(review["review_id"]).strip():
        raise ValueError("review_id is required")
    if review["document_sha256"] != sidecar.get("manifest", {}).get("sha256"):
        raise ValueError("Human review and sidecar refer to different PDF hashes")
    _find_unique_element(sidecar, str(review["element_id"]))
    if review["decision"] == APPROVE_DECISION:
        structure = review.get("corrected_structure")
        if not isinstance(structure, dict) or not structure:
            raise ValueError("An approved review requires a non-empty corrected_structure")
    reviewed_at = str(review["reviewed_at"])
    try:
        datetime.fromisoformat(reviewed_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("reviewed_at must be an ISO-8601 timestamp") from exc
    evidence_files = review["evidence_files"]
    if not isinstance(evidence_files, list) or not evidence_files:
        raise ValueError("At least one evidence file is required")
    for raw_path in evidence_files:
        evidence_path = Path(str(raw_path)).expanduser()
        if not evidence_path.is_absolute():
            evidence_path = review_path.parent / evidence_path
        if not evidence_path.is_file():
            raise ValueError(f"Evidence file does not exist: {evidence_path}")
    _validate_source_pdf(sidecar)


def _validate_source_pdf(sidecar: dict[str, Any]) -> None:
    manifest = sidecar.get("manifest", {})
    source_file = Path(str(manifest.get("source_file", ""))).expanduser()
    expected_sha = str(manifest.get("sha256", ""))
    if not source_file.is_file():
        raise ValueError(f"Source PDF is unavailable: {source_file}")
    if sha256_file(source_file) != expected_sha:
        raise ValueError("Source PDF hash no longer matches the sidecar manifest")


def _find_unique_element(sidecar: dict[str, Any], element_id: str) -> dict[str, Any]:
    matches = [
        element
        for element in sidecar.get("elements", [])
        if isinstance(element, dict) and element.get("element_id") == element_id
    ]
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one element {element_id}, found {len(matches)}")
    return matches[0]


def _review_record(review: dict[str, Any], review_path: Path) -> dict[str, Any]:
    return {
        "review_id": review["review_id"],
        "reviewer": copy.deepcopy(review["reviewer"]),
        "decision": review["decision"],
        "reviewed_at": review["reviewed_at"],
        "notes": review.get("notes", ""),
        "evidence_files": copy.deepcopy(review["evidence_files"]),
        "review_file": str(review_path.resolve()),
        "review_file_sha256": sha256_file(review_path),
    }


def _contains_quantitative_table(structure: dict[str, Any]) -> bool:
    content = structure.get("content", [])
    return any(
        isinstance(item, dict)
        and item.get("type") == "table"
        and isinstance(item.get("data"), list)
        for item in content
    ) or (isinstance(structure.get("columns"), list) and isinstance(structure.get("rows"), list))


def _resolved_sidecar_path(path: Path) -> Path:
    name = path.name
    suffix = ".sidecar.json"
    if name.endswith(suffix):
        return path.with_name(name[: -len(suffix)] + ".resolved.sidecar.json")
    return path.with_name(path.stem + ".resolved.json")


def _verified_markdown_path(path: Path) -> Path:
    name = path.name
    suffix = ".sidecar.json"
    stem = name[: -len(suffix)] if name.endswith(suffix) else path.stem
    return path.with_name(stem + ".verified.md")


def _write_verified_markdown(path: Path, sidecar: dict[str, Any]) -> Path:
    manifest = sidecar.get("manifest", {})
    lines = [
        "# Extraction technique canonique vérifiée",
        "",
        "> Seuls les éléments portant le statut `human_verified` sont canoniques ici.",
        "> L'OCR brut et les lectures machine restent dans le sidecar pour l'audit.",
        "",
        f"- Document : `{manifest.get('document_id', '')}`",
        f"- SHA-256 : `{manifest.get('sha256', '')}`",
        "",
    ]
    verified_count = 0
    unresolved: list[str] = []
    for element in sidecar.get("elements", []):
        if not isinstance(element, dict):
            continue
        canonical = element.get("canonical_extraction")
        if element.get("status") != "human_verified" or not isinstance(canonical, dict):
            unresolved.append(
                f"- `{element.get('element_id')}` — `{element.get('status', 'unknown')}`"
            )
            continue
        verified_count += 1
        page = canonical.get("page", element.get("page", {}))
        lines.extend(
            [
                f"## {element.get('element_id')}",
                "",
                f"- Page PDF : {page.get('pdf_page_number', 'inconnue')}",
                f"- Page imprimée : {page.get('printed_page_normalized') or 'non validée'}",
                f"- Type : `{element.get('element_type')}`",
                f"- Revue : `{canonical.get('review_id')}`",
                "",
            ]
        )
        lines.extend(_render_structure(canonical.get("structure", {})))
        lines.append("")
    if not verified_count:
        lines.extend(["Aucun élément n'a encore été validé humainement.", ""])
    if unresolved:
        lines.extend(
            [
                "## Éléments non canoniques",
                "",
                "Ces éléments restent exclus de tout usage quantitatif :",
                "",
                *unresolved,
                "",
            ]
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    temporary.replace(path)
    return path


def _render_structure(structure: Any) -> list[str]:
    if not isinstance(structure, dict):
        return ["```json", json.dumps(structure, ensure_ascii=False, indent=2), "```"]
    lines: list[str] = []
    caption = structure.get("caption")
    if caption:
        lines.extend([f"**{caption}**", ""])
    content = structure.get("content")
    if isinstance(content, list):
        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "text_block" and item.get("text"):
                lines.extend([str(item["text"]), ""])
            elif item.get("type") == "table":
                lines.extend(_render_markdown_table(item.get("headers"), item.get("data")))
                lines.append("")
    elif isinstance(structure.get("columns"), list) and isinstance(structure.get("rows"), list):
        lines.extend(_render_markdown_table(structure["columns"], structure["rows"]))
    if not lines:
        lines.extend(["```json", json.dumps(structure, ensure_ascii=False, indent=2), "```"])
    return lines


def _render_markdown_table(headers: Any, rows: Any) -> list[str]:
    if not isinstance(headers, list) or not headers or not isinstance(rows, list):
        return [
            "```json",
            json.dumps({"headers": headers, "data": rows}, ensure_ascii=False, indent=2),
            "```",
        ]
    normalized_headers = [_markdown_cell(value) for value in headers]
    lines = [
        "| " + " | ".join(normalized_headers) + " |",
        "| " + " | ".join("---" for _ in normalized_headers) + " |",
    ]
    for row in rows:
        if isinstance(row, list):
            cells = [_markdown_cell(value) for value in row]
            cells += [""] * max(0, len(normalized_headers) - len(cells))
            lines.append("| " + " | ".join(cells[: len(normalized_headers)]) + " |")
    return lines


def _markdown_cell(value: Any) -> str:
    return str(value).replace("|", "\\|").replace("\n", "<br>")
