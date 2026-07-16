from __future__ import annotations

import json
from pathlib import Path

from src.llm.gemini_client import GeminiQuotaError
from src.pipeline import _write_pdf_summary_unavailable


def test_optional_gemini_summary_failure_preserves_local_artifacts(tmp_path: Path) -> None:
    pdf = tmp_path / "book.pdf"
    transcription = tmp_path / "book.transcription.md"
    summary = tmp_path / "book.md"
    error = tmp_path / "book.summary-error.json"
    pdf.write_bytes(b"immutable-source")
    transcription.write_text("# Local transcription\n", encoding="utf-8")

    _write_pdf_summary_unavailable(
        summary,
        error,
        file_path=pdf,
        transcription_path=transcription,
        error=GeminiQuotaError("quota exceeded"),
    )

    assert pdf.read_bytes() == b"immutable-source"
    assert transcription.read_text(encoding="utf-8") == "# Local transcription\n"
    assert "status: summary_unavailable" in summary.read_text(encoding="utf-8")
    report = json.loads(error.read_text(encoding="utf-8"))
    assert report["error_type"] == "GeminiQuotaError"
    assert report["transcription_path"] == str(transcription)
