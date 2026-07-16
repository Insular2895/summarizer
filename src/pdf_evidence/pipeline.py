from __future__ import annotations

import shlex
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from src.config import load_models
from src.llm.base import LLMError, LLMQuotaError
from src.llm.factory import create_llm_client
from src.paths import ensure_dir, project_path
from src.pdf_evidence.core import (
    DetectedElement,
    DocumentManifest,
    ReviewStatus,
    write_json,
)
from src.pdf_evidence.detect import detect_elements, link_cross_page_context
from src.pdf_evidence.evidence import build_evidence_packet
from src.pdf_evidence.gemini_review import GeminiVisualReviewer
from src.pdf_evidence.golden import evaluate_sidecar_against_golden_set
from src.pdf_evidence.ocr import LocalOcrError, ocr_page, should_run_ocr
from src.pdf_evidence.render import PdfRenderer
from src.pdf_evidence.validation import (
    run_deterministic_checks,
    status_after_visual_review,
)


@dataclass(frozen=True)
class TechnicalReviewResult:
    manifest_path: Path
    sidecar_path: Path
    quality_report_path: Path
    evidence_root: Path
    pages_analyzed: int
    elements_detected: int
    gemini_calls: int
    gemini_successes: int
    gemini_failures: int
    gemini_circuit_open: bool
    status_counts: dict[str, int]


class TechnicalPdfEvidencePipeline:
    def __init__(
        self,
        *,
        dpi: int = 350,
        visual_review_enabled: bool = True,
        max_visual_calls: int = 40,
        include_context: bool = False,
        reviewer: GeminiVisualReviewer | None = None,
        ocr_language: str = "eng",
        ocr_min_native_characters: int = 120,
    ) -> None:
        self.dpi = dpi
        self.visual_review_enabled = visual_review_enabled
        self.max_visual_calls = max_visual_calls
        self.include_context = include_context
        self.reviewer = reviewer
        self.ocr_language = ocr_language
        self.ocr_min_native_characters = ocr_min_native_characters

    def run(
        self,
        pdf_path: Path,
        output_base: Path,
        *,
        max_pages: int | None = None,
    ) -> TechnicalReviewResult:
        pdf_path = pdf_path.expanduser().resolve()
        manifest = DocumentManifest.from_pdf(pdf_path)
        evidence_root = ensure_dir(output_base.with_suffix(".evidence"))
        manifest_path = write_json(evidence_root / "manifest.json", asdict(manifest))
        sidecar_path = output_base.with_suffix(".sidecar.json")
        quality_path = output_base.with_suffix(".quality.json")
        reviewer = self.reviewer or self._default_reviewer()
        page_limit = (
            manifest.page_count if max_pages is None else min(max_pages, manifest.page_count)
        )
        elements: list[DetectedElement] = []
        gemini_calls = 0
        gemini_successes = 0
        gemini_failures = 0
        gemini_circuit_open = False
        gemini_circuit_reason: str | None = None
        review_errors: list[dict[str, Any]] = []
        fallback_requests = 0
        ocr_pages = 0
        ocr_errors: list[dict[str, Any]] = []

        with PdfRenderer(pdf_path) as renderer:
            if renderer.page_count != manifest.page_count:
                raise RuntimeError("Renderer and parser disagree on the PDF page count.")
            previous_page_elements: list[DetectedElement] = []
            for page_index in range(page_limit):
                layout = renderer.layout(page_index)
                page_ocr_error: str | None = None
                if should_run_ocr(layout, self.ocr_min_native_characters):
                    try:
                        layout = ocr_page(
                            renderer,
                            page_index,
                            dpi=min(self.dpi, 350),
                            language=self.ocr_language,
                        ).layout
                        ocr_pages += 1
                    except LocalOcrError as exc:
                        page_ocr_error = str(exc)
                        ocr_errors.append({"pdf_page_number": page_index + 1, "error": str(exc)})
                page_elements = detect_elements(manifest.document_id, page_index, layout)
                link_cross_page_context(previous_page_elements, page_elements)
                for element in page_elements:
                    if page_ocr_error:
                        element.alerts.append("local_ocr_failed")
                    run_deterministic_checks(element)
                    packet = build_evidence_packet(
                        renderer,
                        manifest,
                        element,
                        evidence_root,
                        dpi=self.dpi,
                        include_context=(
                            self.include_context
                            or "table_continued_requires_context" in element.alerts
                            or "figure_caption_on_previous_page" in element.alerts
                        ),
                    )
                    if (
                        reviewer is not None
                        and not gemini_circuit_open
                        and gemini_calls < self.max_visual_calls
                    ):
                        try:
                            review = reviewer.review(element, packet)
                            gemini_calls += 1
                            gemini_successes += 1
                            element.visual_review = review
                            element.status = status_after_visual_review(element, review)
                            if element.status in {
                                ReviewStatus.NEEDS_VISUAL_REVIEW,
                                ReviewStatus.HUMAN_REVIEW_REQUIRED,
                                ReviewStatus.BLOCKED,
                            }:
                                _write_fallback_request(
                                    packet,
                                    pdf_path,
                                    element,
                                    reason=f"visual_review_status:{element.status.value}",
                                )
                                fallback_requests += 1
                        except Exception as exc:  # keep local evidence even if remote review fails
                            gemini_calls += 1
                            gemini_failures += 1
                            if isinstance(exc, LLMQuotaError) or _is_quota_exhaustion(exc):
                                gemini_circuit_open = True
                                gemini_circuit_reason = "quota_exhausted"
                            element.status = ReviewStatus.HUMAN_REVIEW_REQUIRED
                            element.alerts.append("gemini_visual_review_failed")
                            review_errors.append(
                                {
                                    "element_id": element.element_id,
                                    "error": str(exc),
                                    "fallback_request": str(packet / "fallback_request.json"),
                                }
                            )
                            _write_fallback_request(
                                packet,
                                pdf_path,
                                element,
                                reason=str(exc),
                            )
                            fallback_requests += 1
                    elif self.visual_review_enabled and element.status != ReviewStatus.IMAGE_ONLY:
                        element.status = ReviewStatus.HUMAN_REVIEW_REQUIRED
                        if reviewer is None:
                            reason = "gemini_visual_review_unavailable"
                        elif gemini_circuit_open:
                            reason = "gemini_visual_review_quota_exhausted"
                        else:
                            reason = "gemini_visual_review_budget_exhausted"
                        if reason not in element.alerts:
                            element.alerts.append(reason)
                        _write_fallback_request(packet, pdf_path, element, reason=reason)
                        fallback_requests += 1
                    elements.append(element)
                previous_page_elements = page_elements

        manifest.assert_source_unchanged(pdf_path)
        statuses = Counter(element.status.value for element in elements)
        sidecar_payload = {
            "schema_version": "2.0",
            "manifest": asdict(manifest),
            "pages_analyzed": page_limit,
            "elements": [element.to_dict() for element in elements],
        }
        write_json(sidecar_path, sidecar_payload)
        golden_metrics = evaluate_sidecar_against_golden_set(
            sidecar_payload,
            project_path("tests", "golden", "pdf_evidence", "annotations"),
        )
        quality_payload = {
            "schema_version": "2.0",
            "document_id": manifest.document_id,
            "source_sha256": manifest.sha256,
            "source_immutable": True,
            "pages_analyzed": page_limit,
            "elements_detected": len(elements),
            "gemini_calls": gemini_calls,
            "gemini_review_attempts": gemini_calls,
            "gemini_successes": gemini_successes,
            "gemini_failures": gemini_failures,
            "gemini_circuit_open": gemini_circuit_open,
            "gemini_circuit_reason": gemini_circuit_reason,
            "visual_review_enabled": self.visual_review_enabled,
            "visual_review_available": reviewer is not None,
            "visual_review_budget": self.max_visual_calls,
            "visual_review_deferred": (
                max(
                    0,
                    len(elements) - gemini_calls,
                )
                if reviewer is not None
                else len(elements)
            ),
            "ocr_pages": ocr_pages,
            "ocr_errors": ocr_errors,
            "status_counts": dict(sorted(statuses.items())),
            "review_errors": review_errors,
            "fallback_requests": fallback_requests,
        }
        quality_payload.update(golden_metrics)
        write_json(quality_path, quality_payload)
        return TechnicalReviewResult(
            manifest_path=manifest_path,
            sidecar_path=sidecar_path,
            quality_report_path=quality_path,
            evidence_root=evidence_root,
            pages_analyzed=page_limit,
            elements_detected=len(elements),
            gemini_calls=gemini_calls,
            gemini_successes=gemini_successes,
            gemini_failures=gemini_failures,
            gemini_circuit_open=gemini_circuit_open,
            status_counts=dict(statuses),
        )

    def _default_reviewer(self) -> GeminiVisualReviewer | None:
        if not self.visual_review_enabled:
            return None
        load_dotenv(project_path(".env"))
        try:
            client = create_llm_client()
        except LLMError:
            return None
        models = load_models()
        model = models.get("pdf_visual_verifier")
        if model is None:
            raise RuntimeError("Missing pdf_visual_verifier model configuration.")
        return GeminiVisualReviewer(
            client,
            model,
            project_path("prompts", "pdf_visual_verifier.md"),
        )


def _write_fallback_request(
    packet: Path,
    pdf_path: Path,
    element: DetectedElement,
    *,
    reason: str,
) -> Path:
    """Persist a deterministic hand-off for Codex or a human visual reviewer."""
    return write_json(
        packet / "fallback_request.json",
        {
            "schema_version": "1.0",
            "element_id": element.element_id,
            "reason": reason,
            "recommended_status": element.status.value,
            "evidence_files": {
                "full_page": str(packet / "full_page_original.png"),
                "normalized_crop": str(packet / "element_crop_normalized.png"),
                "ocr": str(packet / "ocr_text.txt"),
                "candidate": str(packet / "extraction_candidate.json"),
            },
            "inspection_command": (
                "./pdf-evidence inspect "
                f"{shlex.quote(str(pdf_path))} "
                f"--pdf-page {element.page.pdf_page_number} "
                f"--element-id {shlex.quote(element.element_id)} "
                "--dpi 450 --include-context --open-images"
            ),
            "codex_instruction": (
                "Inspect the exact evidence files, list only visible divergences and ambiguity, "
                "and write a separate review JSON. Do not edit the transcription."
            ),
        },
    )


def _is_quota_exhaustion(error: object) -> bool:
    message = str(error).lower()
    return (
        "resource_exhausted" in message
        or "quota exceeded" in message
        or "quota metric" in message
        or "free_tier_requests" in message
    )
