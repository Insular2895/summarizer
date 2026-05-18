from pathlib import Path

from src.menu import build_pdf_command, discover_pdf_files


def test_discover_pdf_files_returns_sorted_pdfs(tmp_path: Path) -> None:
    input_dir = tmp_path / "input" / "pdf"
    input_dir.mkdir(parents=True)
    (input_dir / "b.pdf").write_bytes(b"%PDF")
    (input_dir / "a.pdf").write_bytes(b"%PDF")
    (input_dir / "notes.txt").write_text("ignore", encoding="utf-8")

    assert [path.name for path in discover_pdf_files(tmp_path)] == ["a.pdf", "b.pdf"]


def test_build_pdf_command_for_sample_mode(tmp_path: Path) -> None:
    pdf_path = tmp_path / "input" / "pdf" / "book.pdf"

    command = build_pdf_command(tmp_path, pdf_path, mode="sample", overwrite=True)

    assert command == [
        str(tmp_path / "runpdf"),
        str(pdf_path),
        "--engine",
        "smart",
        "--max-pages",
        "10",
        "--overwrite",
    ]
