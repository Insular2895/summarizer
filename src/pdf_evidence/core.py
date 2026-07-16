from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import asdict, dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Any

from pypdf import PdfReader


class ElementType(StrEnum):
    TABLE = "table"
    FORMULA = "formula"
    FIGURE = "figure"
    CHART = "chart"
    PAYOFF_DIAGRAM = "payoff_diagram"


class ReviewStatus(StrEnum):
    MACHINE_VERIFIED = "machine_verified"
    MACHINE_VERIFIED_WITH_VISUAL_CHECK = "machine_verified_with_visual_check"
    MACHINE_REVIEWED = "machine_reviewed"
    NEEDS_VISUAL_REVIEW = "needs_visual_review"
    HUMAN_VERIFIED = "human_verified"
    HUMAN_REVIEW_REQUIRED = "human_review_required"
    BLOCKED = "blocked"
    UNEXTRACTABLE = "unextractable"
    IMAGE_ONLY = "image_only"


@dataclass(frozen=True)
class BoundingBox:
    x0: float
    y0: float
    x1: float
    y1: float

    def as_list(self) -> list[float]:
        return [self.x0, self.y0, self.x1, self.y1]


@dataclass(frozen=True)
class PageIdentity:
    document_page_id: str
    pdf_page_index: int
    pdf_page_number: int
    printed_page_raw: str | None
    printed_page_normalized: int | None
    printed_page_confidence: float
    chapter: str | None = None
    section: str | None = None


@dataclass
class DetectedElement:
    element_id: str
    element_type: ElementType
    page: PageIdentity
    bbox: BoundingBox
    raw_text: str
    rotation: int = 0
    table_number: str | None = None
    figure_number: str | None = None
    extraction_candidate: dict[str, Any] = field(default_factory=dict)
    confidence: dict[str, float | None] = field(default_factory=dict)
    alerts: list[str] = field(default_factory=list)
    status: ReviewStatus = ReviewStatus.NEEDS_VISUAL_REVIEW
    visual_review: dict[str, Any] | None = None
    text_source: str = "native_pdf_text"
    data_digitized: bool | None = None

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        value["element_type"] = self.element_type.value
        value["status"] = self.status.value
        value["bbox"] = self.bbox.as_list()
        return value


@dataclass(frozen=True)
class DocumentManifest:
    document_id: str
    source_file: str
    sha256: str
    page_count: int
    byte_size: int
    modified_ns: int
    pipeline_version: str = "pdf-evidence-v2"

    @classmethod
    def from_pdf(cls, pdf_path: Path) -> DocumentManifest:
        stat = pdf_path.stat()
        digest = sha256_file(pdf_path)
        page_count = len(PdfReader(str(pdf_path)).pages)
        slug = re.sub(r"[^a-z0-9]+", "-", pdf_path.stem.lower()).strip("-") or "pdf"
        return cls(
            document_id=f"{slug}-{digest[:12]}",
            source_file=str(pdf_path.resolve()),
            sha256=digest,
            page_count=page_count,
            byte_size=stat.st_size,
            modified_ns=stat.st_mtime_ns,
        )

    def assert_source_unchanged(self, pdf_path: Path) -> None:
        stat = pdf_path.stat()
        if stat.st_size != self.byte_size or sha256_file(pdf_path) != self.sha256:
            raise RuntimeError("The source PDF changed while it was being processed.")


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, value: Any) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)
    return path


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object in {path}")
    return value
