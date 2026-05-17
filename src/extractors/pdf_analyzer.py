from __future__ import annotations

import re
import shutil
from dataclasses import dataclass, field
from pathlib import Path

from pypdf import PdfReader


@dataclass(frozen=True)
class PdfComplexity:
    page_count: int
    sampled_pages: int
    extracted_chars: int
    avg_chars_per_page: int
    image_count: int
    table_hint_count: int
    formula_hint_count: int
    scanned_likely: bool
    complexity: str
    reasons: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class PdfEnginePlan:
    preferred_engine: str
    fallback_order: list[str]
    complexity: PdfComplexity
    available_engines: dict[str, bool]


FORMULA_RE = re.compile(r"[∑∫√≈≤≥∞]|(?:\b[a-zA-Z]\s*=\s*[-+*/()\w\s]+)")


def analyze_pdf_complexity(pdf_path: Path, max_sample_pages: int = 8) -> PdfComplexity:
    reader = PdfReader(str(pdf_path))
    page_count = len(reader.pages)
    sample_indexes = _sample_indexes(page_count, max_sample_pages)
    texts: list[str] = []
    image_count = 0

    for index in sample_indexes:
        page = reader.pages[index]
        texts.append(page.extract_text() or "")
        image_count += _count_page_images(page)

    joined_text = "\n".join(texts)
    extracted_chars = len(joined_text.strip())
    sampled_pages = len(sample_indexes)
    avg_chars = extracted_chars // sampled_pages if sampled_pages else 0
    table_hints = _count_table_hints(joined_text)
    formula_hints = len(FORMULA_RE.findall(joined_text))
    scanned_likely = (
        page_count > 0 and avg_chars < 120 and image_count >= max(1, sampled_pages // 2)
    )
    complexity, reasons = _classify(
        page_count=page_count,
        avg_chars=avg_chars,
        image_count=image_count,
        table_hints=table_hints,
        formula_hints=formula_hints,
        scanned_likely=scanned_likely,
    )
    return PdfComplexity(
        page_count=page_count,
        sampled_pages=sampled_pages,
        extracted_chars=extracted_chars,
        avg_chars_per_page=avg_chars,
        image_count=image_count,
        table_hint_count=table_hints,
        formula_hint_count=formula_hints,
        scanned_likely=scanned_likely,
        complexity=complexity,
        reasons=reasons,
    )


def build_pdf_engine_plan(pdf_path: Path) -> PdfEnginePlan:
    complexity = analyze_pdf_complexity(pdf_path)
    available = {
        "mineru": shutil.which("mineru") is not None,
        "marker": shutil.which("marker_single") is not None,
        "text": True,
    }
    fallback_order = choose_engine_order(complexity, available)
    return PdfEnginePlan(
        preferred_engine=fallback_order[0],
        fallback_order=fallback_order,
        complexity=complexity,
        available_engines=available,
    )


def choose_engine_order(
    complexity: PdfComplexity,
    available_engines: dict[str, bool] | None = None,
) -> list[str]:
    available = available_engines or {"mineru": True, "marker": True, "text": True}
    if complexity.scanned_likely or complexity.complexity == "high":
        preferred = ["mineru", "marker", "text"]
    elif complexity.complexity == "medium":
        preferred = ["mineru", "text", "marker"]
    else:
        preferred = ["text", "mineru", "marker"]

    order = [engine for engine in preferred if available.get(engine, False)]
    return order or ["text"]


def _sample_indexes(page_count: int, max_sample_pages: int) -> list[int]:
    if page_count <= 0:
        return []
    if page_count <= max_sample_pages:
        return list(range(page_count))
    raw_indexes = {
        0,
        1,
        2,
        page_count // 4,
        page_count // 2,
        (page_count * 3) // 4,
        page_count - 2,
        page_count - 1,
    }
    return sorted(index for index in raw_indexes if 0 <= index < page_count)[:max_sample_pages]


def _count_page_images(page: object) -> int:
    try:
        resources = page.get("/Resources", {})  # type: ignore[attr-defined]
        xobjects = resources.get("/XObject", {})
        return sum(1 for item in xobjects.values() if item.get("/Subtype") == "/Image")
    except Exception:
        return 0


def _count_table_hints(text: str) -> int:
    hints = 0
    for line in text.splitlines():
        parts = [part for part in re.split(r"\s{2,}|\t", line.strip()) if part]
        if len(parts) >= 3:
            hints += 1
    return hints


def _classify(
    page_count: int,
    avg_chars: int,
    image_count: int,
    table_hints: int,
    formula_hints: int,
    scanned_likely: bool,
) -> tuple[str, list[str]]:
    reasons: list[str] = []
    score = 0
    if scanned_likely:
        score += 4
        reasons.append("PDF probablement scanné ou très visuel")
    if page_count >= 150:
        score += 2
        reasons.append("document long")
    elif page_count >= 60:
        score += 1
        reasons.append("document de taille moyenne")
    if image_count >= 8:
        score += 2
        reasons.append("nombreuses images détectées")
    elif image_count >= 3:
        score += 1
        reasons.append("images détectées")
    if table_hints >= 10:
        score += 2
        reasons.append("structure de tableaux probable")
    elif table_hints >= 3:
        score += 1
        reasons.append("quelques tableaux probables")
    if formula_hints >= 5:
        score += 2
        reasons.append("formules ou notation technique probable")
    elif formula_hints >= 1:
        score += 1
        reasons.append("notation technique détectée")
    if avg_chars >= 900 and score == 0:
        reasons.append("texte extractible dense et simple")
    if avg_chars < 120 and not scanned_likely:
        score += 1
        reasons.append("peu de texte extractible")

    if score >= 4:
        return "high", reasons
    if score >= 2:
        return "medium", reasons
    return "low", reasons or ["texte extractible simple"]
