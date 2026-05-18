from pathlib import Path

from src.converters.srt_to_text import convert_srt_to_text, subtitle_to_text


def test_convert_srt_to_text(tmp_path: Path) -> None:
    output = tmp_path / "sample.txt"
    convert_srt_to_text(Path("tests/fixtures/sample.srt"), output)

    assert (
        output.read_text(encoding="utf-8") == "Bonjour tout le monde.\nVoici une idée importante.\n"
    )


def test_vtt_cleanup_removes_tags_and_consecutive_duplicates() -> None:
    text = Path("tests/fixtures/sample.vtt").read_text(encoding="utf-8")

    assert subtitle_to_text(text) == "Bonjour\nDeuxième phrase.\n"
