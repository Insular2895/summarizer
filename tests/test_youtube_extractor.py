from pathlib import Path

import pytest

from src.extractors.youtube import IncompletePlaylistError, YouTubeExtractor


class FakeYoutubeDL:
    def __init__(self, _options):  # type: ignore[no-untyped-def]
        pass

    def __enter__(self):  # type: ignore[no-untyped-def]
        return self

    def __exit__(self, *_args):  # type: ignore[no-untyped-def]
        return None

    def extract_info(self, _url, download=False):  # type: ignore[no-untyped-def]
        assert download is False
        return {
            "title": "Long playlist",
            "playlist_count": 363,
            "entries": [
                {
                    "id": "first-video",
                    "title": "First video",
                    "url": "first-video",
                }
            ],
        }


def test_playlist_extraction_refuses_silent_youtube_pagination_truncation(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr("src.extractors.youtube.YoutubeDL", FakeYoutubeDL)

    with pytest.raises(IncompletePlaylistError) as error:
        YouTubeExtractor(tmp_path).list_playlist("https://www.youtube.com/playlist?list=long")

    assert error.value.reported_count == 363
    assert error.value.extracted_count == 1
    assert "Update yt-dlp" in str(error.value)
