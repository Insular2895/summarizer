import json
from pathlib import Path

from src.storage.youtube_library import YouTubeLibrary


def test_library_stores_one_canonical_transcript_per_video_id(tmp_path: Path) -> None:
    library = YouTubeLibrary(tmp_path / "library" / "youtube")

    first = library.store(
        video_id="vid_XyZ-123",
        title="First title",
        url="https://youtube.com/watch?v=vid_XyZ-123",
        transcript="canonical transcript\n",
        source_path=tmp_path / "source.srt",
    )
    second = library.store(
        video_id="vid_XyZ-123",
        title="Updated title",
        url="https://youtube.com/watch?v=vid_XyZ-123",
        transcript="canonical transcript\n",
        source_path=None,
    )

    assert first == second
    assert (first / "transcript.txt").read_text(encoding="utf-8") == "canonical transcript\n"
    metadata = json.loads((first / "metadata.json").read_text(encoding="utf-8"))
    assert metadata["video_id"] == "vid_XyZ-123"
    assert metadata["title"] == "Updated title"


def test_library_reuses_existing_transcript(tmp_path: Path) -> None:
    library = YouTubeLibrary(tmp_path / "library" / "youtube")
    library.store(
        video_id="vid_XyZ-123",
        title="Video",
        url="https://youtube.com/watch?v=vid_XyZ-123",
        transcript="already stored\n",
        source_path=None,
    )

    assert library.transcript_path("vid_XyZ-123").read_text(encoding="utf-8") == "already stored\n"


def test_library_deduplicates_legacy_transcripts_by_content(tmp_path: Path) -> None:
    library = YouTubeLibrary(tmp_path / "library" / "youtube")

    first = library.store_legacy("Legacy A", "same transcript\n", "playlists/A.txt")
    second = library.store_legacy("Legacy B", "same transcript\n", "playlists/B.txt")

    assert first == second
    metadata = json.loads((first / "metadata.json").read_text(encoding="utf-8"))
    assert metadata["kind"] == "legacy"
    assert metadata["source_paths"] == ["playlists/A.txt", "playlists/B.txt"]
