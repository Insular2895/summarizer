from pathlib import Path

from src.extractors.youtube import YouTubeVideo
from src.llm.base import LLMError, LLMQuotaError
from src.pipeline import run_playlist
from src.web_adapter import CollectingObserver
from src.web_adapter.errors import map_pipeline_error


class FakePlaylistExtractor:
    def __init__(self, cache_dir: Path) -> None:
        self.cache_dir = cache_dir

    def list_playlist(self, _url: str) -> tuple[str, list[YouTubeVideo]]:
        return (
            "Web fixture",
            [
                YouTubeVideo("https://youtu.be/aaaaaaaaaaa", "A", "aaaaaaaaaaa", "a"),
                YouTubeVideo("https://youtu.be/bbbbbbbbbbb", "B", "bbbbbbbbbbb", "b"),
                YouTubeVideo("https://youtu.be/aaaaaaaaaaa", "A bis", "aaaaaaaaaaa", "a-bis"),
            ],
        )

    def download_subtitles(self, url: str, slug: str) -> Path:
        if "bbbbbbbbbbb" in url:
            raise RuntimeError("No subtitles found (private provider detail)")
        path = self.cache_dir / slug / f"{slug}.srt"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            "1\n00:00:01,000 --> 00:00:02,500\nTexte horodaté.\n",
            encoding="utf-8",
        )
        return path


class FakeVideoSummarizer:
    def summarize(
        self,
        title: str,
        _url: str,
        _transcript: str,
        output_path: Path,
        summary_focus: str | None = None,
    ) -> tuple[Path, str]:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            f"---\ntitle: {title}\n---\n\n# {title}\n\nRésumé {summary_focus or 'standard'}.\n",
            encoding="utf-8",
        )
        return output_path, "fixture-model"


def test_playlist_emits_ready_per_video_and_continues_after_failure(monkeypatch, tmp_path) -> None:
    observer = CollectingObserver()
    monkeypatch.setattr("src.pipeline.YouTubeExtractor", FakePlaylistExtractor)
    monkeypatch.setattr("src.pipeline.VideoSummarizer", FakeVideoSummarizer)
    monkeypatch.setattr("src.pipeline.project_path", lambda *parts: tmp_path.joinpath(*parts))
    monkeypatch.setattr(
        "src.pipeline.manifest_path_for_playlist",
        lambda _name: tmp_path / "manifest.json",
    )

    manifest = run_playlist(
        "https://www.youtube.com/playlist?list=PLfixture123",
        observer=observer,
        overwrite=True,
        summary_focus="technique",
    )

    assert [video.status for video in manifest.videos] == ["done", "failed", "done"]
    assert len(observer.plans) == 1
    assert [video.playlist_index for video in observer.plans[0].videos] == [1, 2, 3]
    assert [video.youtube_id for video in observer.plans[0].videos] == [
        "aaaaaaaaaaa",
        "bbbbbbbbbbb",
        "aaaaaaaaaaa",
    ]
    assert [result.title for result in observer.ready] == ["A", "A bis"]
    assert [failure.title for failure in observer.failed] == ["B"]
    assert observer.failed[0].diagnostic_code == "SUBTITLES_UNAVAILABLE"
    assert "private provider detail" not in observer.failed[0].public_error
    assert [event.youtube_id for event in observer.events if event.status == "READY"] == [
        "aaaaaaaaaaa",
        "aaaaaaaaaaa",
    ]
    assert [event.youtube_id for event in observer.events if event.status == "FAILED"] == [
        "bbbbbbbbbbb"
    ]
    assert observer.ready[0].playlist_index == 1
    assert observer.ready[1].playlist_index == 3
    assert observer.ready[0].summary_markdown.startswith("# A")
    assert observer.ready[0].transcript[0].start_ms == 1_000
    assert observer.ready[0].provenance["subtitle_format"] == "srt"


def test_playlist_resume_skips_only_the_ready_occurrence(monkeypatch, tmp_path) -> None:
    observer = CollectingObserver()
    monkeypatch.setattr("src.pipeline.YouTubeExtractor", FakePlaylistExtractor)
    monkeypatch.setattr("src.pipeline.VideoSummarizer", FakeVideoSummarizer)
    monkeypatch.setattr("src.pipeline.project_path", lambda *parts: tmp_path.joinpath(*parts))
    monkeypatch.setattr(
        "src.pipeline.manifest_path_for_playlist",
        lambda _name: tmp_path / "manifest.json",
    )

    manifest = run_playlist(
        "https://www.youtube.com/playlist?list=PLfixture123",
        observer=observer,
        overwrite=True,
        skip_video_occurrences={("aaaaaaaaaaa", 1)},
    )

    assert [(video.playlist_index, video.status) for video in manifest.videos] == [
        (2, "failed"),
        (3, "done"),
    ]
    assert [(result.youtube_id, result.playlist_index) for result in observer.ready] == [
        ("aaaaaaaaaaa", 3)
    ]


def test_unknown_error_mapping_does_not_expose_exception_text() -> None:
    mapped = map_pipeline_error(RuntimeError("secret internal path /tmp/private"))

    assert mapped.diagnostic_code == "VIDEO_PROCESSING_FAILED"
    assert "private" not in mapped.message


def test_llm_errors_have_distinct_stable_diagnostic_codes() -> None:
    assert map_pipeline_error(LLMQuotaError("provider quota detail")).diagnostic_code == "LLM_QUOTA"
    assert map_pipeline_error(LLMError("provider failure detail")).diagnostic_code == "LLM_FAILED"
