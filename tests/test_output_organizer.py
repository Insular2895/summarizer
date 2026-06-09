from pathlib import Path

from src.storage.output_organizer import organize_outputs


def test_organizer_removes_graphipy_copies_and_keeps_richest_video_summary(tmp_path: Path) -> None:
    videos = tmp_path / "output" / "videos"
    graphipy = tmp_path / "output" / "graphipy_ready"
    videos.mkdir(parents=True)
    graphipy.mkdir(parents=True)
    short = videos / "short.md"
    rich = videos / "playlist" / "rich.md"
    rich.parent.mkdir()
    short.write_text('url: "https://youtube.test/watch?v=one"\nshort\n', encoding="utf-8")
    rich.write_text('url: "https://youtube.test/watch?v=one"\nricher content\n', encoding="utf-8")
    (graphipy / "short.md").write_text(short.read_text(encoding="utf-8"), encoding="utf-8")
    book = graphipy / "book.md"
    book.write_text('source_type: "pdf"\nbook content\n', encoding="utf-8")

    report = organize_outputs(tmp_path, apply=True)

    assert report.duplicate_video_summaries_removed == 1
    assert report.graphipy_copies_removed == 1
    assert report.unique_exports_moved == 1
    assert report.root_video_summaries_moved == 0
    assert not short.exists()
    assert rich.exists()
    assert (videos / "playlist-before" / "short.md").exists() is False
    assert (tmp_path / "output" / "books" / "book.md").exists()
    assert not book.exists()


def test_organizer_moves_root_video_summaries_to_playlist_before(tmp_path: Path) -> None:
    videos = tmp_path / "output" / "videos"
    videos.mkdir(parents=True)
    summary = videos / "old-video.md"
    summary.write_text('url: "https://youtube.test/watch?v=old"\nsummary\n', encoding="utf-8")

    report = organize_outputs(tmp_path, apply=True)

    assert report.root_video_summaries_moved == 1
    assert not summary.exists()
    assert (videos / "playlist-before" / "old-video.md").exists()
