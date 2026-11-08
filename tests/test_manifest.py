from pathlib import Path

from src.storage.manifest import JobManifest, VideoStatus


def test_manifest_marks_success_and_failure(tmp_path: Path) -> None:
    manifest = JobManifest("playlist")
    manifest.upsert_video(VideoStatus(url="a", title="A", status="done", kept=True))
    manifest.upsert_video(VideoStatus(url="b", title="B", status="failed", error="No subtitles"))
    path = tmp_path / "manifest.json"

    manifest.save(path)
    loaded = JobManifest.load_or_create(path, "playlist")

    assert loaded.get("a").status == "done"  # type: ignore[union-attr]
    assert loaded.get("b").error == "No subtitles"  # type: ignore[union-attr]


def test_manifest_preserves_duplicate_urls_by_playlist_occurrence() -> None:
    manifest = JobManifest("playlist")
    manifest.upsert_video(VideoStatus(url="same", status="done", playlist_index=1))
    manifest.upsert_video(VideoStatus(url="same", status="failed", playlist_index=3))

    assert len(manifest.videos) == 2
    assert manifest.get("same", 1).status == "done"  # type: ignore[union-attr]
    assert manifest.get("same", 3).status == "failed"  # type: ignore[union-attr]


def test_manifest_migrates_one_legacy_url_without_collapsing_later_duplicates() -> None:
    manifest = JobManifest("playlist", [VideoStatus(url="same", status="failed")])

    manifest.upsert_video(VideoStatus(url="same", status="done", playlist_index=1))
    manifest.upsert_video(VideoStatus(url="same", status="done", playlist_index=3))

    assert [video.playlist_index for video in manifest.videos] == [1, 3]
