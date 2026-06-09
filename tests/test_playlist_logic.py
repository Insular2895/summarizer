from src.extractors.youtube import YouTubeVideo
from src.pipeline import _load_or_extract_video_transcript, _process_video, run_playlist
from src.storage.manifest import VideoStatus
from src.storage.youtube_library import YouTubeLibrary


class FakeExtractor:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def download_subtitles(self, url: str, slug: str):  # type: ignore[no-untyped-def]
        self.calls.append(url)
        raise RuntimeError("No subtitles found")


def test_process_video_failure_can_be_handled_per_video() -> None:
    extractor = FakeExtractor()
    video = YouTubeVideo("https://example.test/a", "A", "a", "a")

    try:
        _process_video(video, extractor)  # type: ignore[arg-type]
    except RuntimeError as exc:
        assert "No subtitles found" in str(exc)

    assert extractor.calls == ["https://example.test/a"]


def test_process_video_can_use_playlist_order_slug() -> None:
    extractor = FakeExtractor()
    video = YouTubeVideo("https://example.test/a", "A", "a", "a")

    status = _process_video(video, extractor, dry_run=True, output_slug="001-a")  # type: ignore[arg-type]

    assert status.output_path is not None
    assert status.output_path.endswith("output/videos/001-a.md")
    assert extractor.calls == []


def test_playlist_outputs_go_to_ordered_playlist_folder(monkeypatch, tmp_path) -> None:
    video = YouTubeVideo("https://example.test/a", "A", "a", "a")

    class FakePlaylistExtractor:
        def __init__(self, _cache_dir):  # type: ignore[no-untyped-def]
            pass

        def list_playlist(self, _url):  # type: ignore[no-untyped-def]
            return "My Playlist", [video]

    captured: dict[str, object] = {}

    def fake_process_video(video, extractor, **kwargs):  # type: ignore[no-untyped-def]
        captured.update(kwargs)
        return VideoStatus(url=video.url, title=video.title, status="done", kept=True)

    monkeypatch.setattr("src.pipeline.YouTubeExtractor", FakePlaylistExtractor)
    monkeypatch.setattr("src.pipeline._process_video", fake_process_video)
    monkeypatch.setattr("src.pipeline.project_path", lambda *parts: tmp_path.joinpath(*parts))

    run_playlist("https://youtube.test/playlist?list=abc")

    assert captured["output_slug"] == "001-a"
    assert captured["output_dir"] == tmp_path / "output" / "videos" / "playlist-my-playlist"
    assert captured["graphipy_output_dir"] == (
        tmp_path / "output" / "graphipy_ready" / "playlist-my-playlist"
    )


def test_motion_playlist_assigns_reference_types_by_position(monkeypatch, tmp_path) -> None:
    videos = [
        YouTubeVideo(f"https://example.test/{index}", f"Video {index}", str(index), str(index))
        for index in range(1, 11)
    ]

    class FakePlaylistExtractor:
        def __init__(self, _cache_dir):  # type: ignore[no-untyped-def]
            pass

        def list_playlist(self, _url):  # type: ignore[no-untyped-def]
            return "Motion", videos

    captured: list[dict[str, object]] = []

    def fake_process_video(video, extractor, **kwargs):  # type: ignore[no-untyped-def]
        captured.append(kwargs)
        return VideoStatus(url=video.url, title=video.title, status="done", kept=True)

    monkeypatch.setattr("src.pipeline.YouTubeExtractor", FakePlaylistExtractor)
    monkeypatch.setattr("src.pipeline._process_video", fake_process_video)
    monkeypatch.setattr("src.pipeline.project_path", lambda *parts: tmp_path.joinpath(*parts))

    run_playlist(
        "https://youtube.test/playlist?list=motion",
        mode="motion-director",
        tutorials_last=3,
        mixed_indices={2},
    )

    assert captured[0]["motion_options"].reference_type == "visual_reference"  # type: ignore[union-attr]
    assert captured[1]["motion_options"].reference_type == "mixed"  # type: ignore[union-attr]
    assert captured[6]["motion_options"].reference_type == "visual_reference"  # type: ignore[union-attr]
    assert captured[7]["motion_options"].reference_type == "tutorial"  # type: ignore[union-attr]
    assert captured[9]["motion_options"].reference_type == "tutorial"  # type: ignore[union-attr]
    assert captured[0]["output_dir"] == tmp_path / "output" / "motion" / "playlist-motion"


def test_playlist_manifest_keeps_duplicate_video_occurrences(monkeypatch, tmp_path) -> None:
    videos = [
        YouTubeVideo("https://example.test/same", "First", "same", "first"),
        YouTubeVideo("https://example.test/same", "Second", "same", "second"),
    ]

    class FakePlaylistExtractor:
        def __init__(self, _cache_dir):  # type: ignore[no-untyped-def]
            pass

        def list_playlist(self, _url):  # type: ignore[no-untyped-def]
            return "Duplicates", videos

    def fake_process_video(video, extractor, **kwargs):  # type: ignore[no-untyped-def]
        return VideoStatus(url=video.url, title=video.title, status="done", kept=True)

    monkeypatch.setattr("src.pipeline.YouTubeExtractor", FakePlaylistExtractor)
    monkeypatch.setattr("src.pipeline._process_video", fake_process_video)
    monkeypatch.setattr("src.pipeline.project_path", lambda *parts: tmp_path.joinpath(*parts))

    manifest = run_playlist("https://youtube.test/playlist?list=duplicates")

    assert len(manifest.videos) == 2
    assert manifest.videos[0].url.endswith("#playlist-index=1")
    assert manifest.videos[1].url.endswith("#playlist-index=2")


def test_video_transcript_reuses_canonical_library(monkeypatch, tmp_path) -> None:
    video = YouTubeVideo("https://example.test/a", "A", "vid_XyZ-123", "a-vid_XyZ-123")
    library = YouTubeLibrary(tmp_path / "library" / "youtube")
    library.store(video.video_id, video.title, video.url, "stored transcript\n", None)
    extractor = FakeExtractor()

    monkeypatch.setattr("src.pipeline.project_path", lambda *parts: tmp_path.joinpath(*parts))
    monkeypatch.setattr(
        "src.pipeline.youtube_library_path", lambda: tmp_path / "library" / "youtube"
    )

    transcript = _load_or_extract_video_transcript(video, extractor)  # type: ignore[arg-type]

    assert transcript == "stored transcript\n"
    assert extractor.calls == []


def test_video_transcript_is_archived_and_temp_cache_removed(monkeypatch, tmp_path) -> None:
    video = YouTubeVideo("https://example.test/a", "A", "vid_XyZ-123", "a-vid_XyZ-123")

    class SuccessfulExtractor:
        def download_subtitles(self, url, slug):  # type: ignore[no-untyped-def]
            directory = tmp_path / "cache" / "transcripts" / slug
            directory.mkdir(parents=True)
            path = directory / "source.srt"
            path.write_text(
                "1\n00:00:00,000 --> 00:00:01,000\nArchived transcript\n",
                encoding="utf-8",
            )
            return path

    monkeypatch.setattr("src.pipeline.project_path", lambda *parts: tmp_path.joinpath(*parts))
    monkeypatch.setattr(
        "src.pipeline.youtube_library_path", lambda: tmp_path / "library" / "youtube"
    )

    def delete_temp(path):  # type: ignore[no-untyped-def]
        for item in path.rglob("*"):
            if item.is_file():
                item.unlink()
        path.rmdir()

    monkeypatch.setattr("src.pipeline.safe_delete", delete_temp)

    transcript = _load_or_extract_video_transcript(video, SuccessfulExtractor())  # type: ignore[arg-type]

    assert transcript == "Archived transcript\n"
    assert (tmp_path / "library" / "youtube" / video.video_id / "transcript.txt").read_text(
        encoding="utf-8"
    ) == "Archived transcript\n"
    assert not (tmp_path / "cache" / "transcripts" / video.slug).exists()
