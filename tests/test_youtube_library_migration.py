from pathlib import Path

from src.storage.youtube_library_migration import migrate_youtube_sources


def test_migration_moves_modern_cache_and_deduplicates_legacy_files(tmp_path: Path) -> None:
    modern = tmp_path / "cache" / "transcripts" / "some-title-vid_XyZ-123"
    modern.mkdir(parents=True)
    (modern / "some-title-vid_XyZ-123.txt").write_text("modern transcript\n", encoding="utf-8")
    (modern / "Some title.en.srt").write_text("subtitle\n", encoding="utf-8")

    legacy = tmp_path / "playlists" / "Playlist 1"
    legacy.mkdir(parents=True)
    (legacy / "01 - Old.en.txt").write_text("legacy transcript\n", encoding="utf-8")
    (legacy / "01 - Old.en-orig.txt").write_text("legacy transcript\n", encoding="utf-8")

    report = migrate_youtube_sources(tmp_path, apply=True)

    assert report.modern_imported == 1
    assert report.legacy_imported == 1
    assert report.duplicates_skipped == 1
    assert not modern.exists()
    assert not (legacy / "01 - Old.en.txt").exists()
    assert not (legacy / "01 - Old.en-orig.txt").exists()
    assert (tmp_path / "library" / "youtube" / "vid_XyZ-123" / "transcript.txt").exists()
