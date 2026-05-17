from src.extractors.youtube import YouTubeVideo
from src.pipeline import _process_video


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
