from pathlib import Path

from src.paths import youtube_library_path


def test_youtube_library_path_can_point_to_external_storage(monkeypatch, tmp_path: Path) -> None:
    target = tmp_path / "ssd" / "youtube"
    monkeypatch.setenv("YOUTUBE_LIBRARY_DIR", str(target))

    assert youtube_library_path() == target
