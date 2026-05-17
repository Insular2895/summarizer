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
