from pathlib import Path

from src.converters.subtitle_timestamps import subtitle_file_to_blocks, subtitle_to_blocks


def test_srt_blocks_keep_millisecond_boundaries() -> None:
    blocks = subtitle_file_to_blocks(Path("tests/fixtures/sample.srt"))

    assert [block.text for block in blocks] == [
        "Bonjour tout le monde.",
        "Voici une idée importante.",
    ]
    assert (blocks[0].start_ms, blocks[0].end_ms) == (1_000, 2_000)
    assert (blocks[1].start_ms, blocks[1].end_ms) == (3_000, 4_000)


def test_webvtt_blocks_remove_tags_and_consecutive_duplicates() -> None:
    blocks = subtitle_to_blocks(Path("tests/fixtures/sample.vtt").read_text(encoding="utf-8"))

    assert [(block.block_index, block.text) for block in blocks] == [
        (0, "Bonjour"),
        (1, "Deuxième phrase."),
    ]
    assert blocks[1].start_ms == 4_000
