import subprocess
from pathlib import Path

from src.extractors import pdf_mineru


def test_mineru_uses_pipeline_ocr_and_max_pages(tmp_path: Path, monkeypatch) -> None:
    calls: list[list[str]] = []
    pdf_path = tmp_path / "Book.pdf"
    pdf_path.write_bytes(b"%PDF")

    monkeypatch.setattr(pdf_mineru.shutil, "which", lambda _name: "/usr/local/bin/mineru")

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

    monkeypatch.setattr(pdf_mineru.subprocess, "run", fake_run)
    monkeypatch.setattr(pdf_mineru, "_find_markdown", lambda output_dir: output_dir / "book.md")

    result = pdf_mineru.extract_pdf_with_mineru(pdf_path, tmp_path / "cache", max_pages=10)

    assert result == tmp_path / "cache" / "book" / "book.md"
    assert calls == [
        [
            "mineru",
            "-p",
            str(pdf_path),
            "-o",
            str(tmp_path / "cache" / "book"),
            "-b",
            "pipeline",
            "-m",
            "ocr",
            "-s",
            "0",
            "-e",
            "9",
        ]
    ]
