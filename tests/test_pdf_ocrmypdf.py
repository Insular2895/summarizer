import subprocess
from pathlib import Path

from src.extractors import pdf_ocrmypdf


def test_ocrmypdf_creates_searchable_pdf_then_markdown(tmp_path: Path, monkeypatch) -> None:
    calls: list[list[str]] = []
    pdf_path = tmp_path / "Book.pdf"
    pdf_path.write_bytes(b"%PDF")

    monkeypatch.setattr(
        pdf_ocrmypdf, "_ocrmypdf_command_prefix", lambda: ["python", "-m", "ocrmypdf"]
    )

    def fake_run(
        command: list[str],
        check: bool,
        capture_output: bool,
        text: bool,
    ) -> subprocess.CompletedProcess[str]:
        assert check is True
        assert capture_output is True
        assert text is True
        calls.append(command)
        return subprocess.CompletedProcess(command, 0)

    def fake_write_pdf_text_as_markdown(
        pdf_path: Path,
        output_path: Path,
        max_pages: int | None = None,
    ) -> Path:
        assert pdf_path == tmp_path / "cache" / "book" / "ocrmypdf" / "book.ocr.pdf"
        assert output_path == tmp_path / "cache" / "book" / "ocrmypdf" / "book.md"
        assert max_pages == 10
        output_path.write_text("# Page 1\n\nText\n", encoding="utf-8")
        return output_path

    monkeypatch.setattr(pdf_ocrmypdf.subprocess, "run", fake_run)
    monkeypatch.setattr(pdf_ocrmypdf, "write_pdf_text_as_markdown", fake_write_pdf_text_as_markdown)

    result = pdf_ocrmypdf.extract_pdf_with_ocrmypdf(pdf_path, tmp_path / "cache", max_pages=10)

    assert result == tmp_path / "cache" / "book" / "ocrmypdf" / "book.md"
    assert calls == [
        [
            "python",
            "-m",
            "ocrmypdf",
            "--output-type",
            "pdf",
            "--optimize",
            "0",
            "--rotate-pages",
            "--deskew",
            "--skip-text",
            "--jobs",
            "2",
            "-l",
            "eng",
            "--pages",
            "1-10",
            str(pdf_path),
            str(tmp_path / "cache" / "book" / "ocrmypdf" / "book.ocr.pdf"),
        ]
    ]
