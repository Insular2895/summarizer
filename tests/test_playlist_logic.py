from src.extractors.youtube import YouTubeVideo
from src.pipeline import _process_video, run_playlist
from src.storage.manifest import VideoStatus


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


def test_playlist_passes_summary_focus_to_each_video(monkeypatch, tmp_path) -> None:
    captured: dict[str, object] = {}

    class FakePlaylistExtractor:
        def __init__(self, _cache_dir) -> None:  # type: ignore[no-untyped-def]
            pass

        def list_playlist(self, _url: str) -> tuple[str, list[YouTubeVideo]]:
            return (
                "My playlist",
                [YouTubeVideo("https://example.test/a", "A", "a", "a")],
            )

    def fake_process_video(video, _extractor, **kwargs):  # type: ignore[no-untyped-def]
        captured.update(kwargs)
        return VideoStatus(video.url, video.title, "done", kept=True)

    monkeypatch.setattr("src.pipeline.YouTubeExtractor", FakePlaylistExtractor)
    monkeypatch.setattr("src.pipeline._process_video", fake_process_video)
    monkeypatch.setattr(
        "src.pipeline.manifest_path_for_playlist",
        lambda _name: tmp_path / "manifest.json",
    )

    run_playlist(
        "https://youtube.test/playlist?list=abc",
        summary_focus="Priorise les mécanismes techniques.",
    )

    assert captured["summary_focus"] == "Priorise les mécanismes techniques."
