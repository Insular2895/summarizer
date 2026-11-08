from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from src.exporters import graphipy
from src.worker.client import LeaseClaim
from src.worker.graphipy_finalizer import GraphipyOutboxFinalizer

GOLDEN = Path(__file__).parent / "golden" / "graphipy_web_video.md"


def manifest() -> dict[str, Any]:
    return {
        "job_id": "job_web_fixture",
        "source": {
            "id": "source_fixture",
            "title": "Playlist Démo & tests",
            "normalized_url": "https://www.youtube.com/playlist?list=PLfixture",
            "source_kind": "youtube_playlist",
            "created_at": "2026-09-21T10:00:00.000Z",
        },
        "kept_videos": [
            {
                "id": "video_fixture",
                "youtube_id": "abcdefghijk",
                "playlist_index": 2,
                "title": 'Une "vidéo" & café',
            }
        ],
    }


def item() -> dict[str, Any]:
    return {
        "video": {
            "id": "video_fixture",
            "job_id": "job_web_fixture",
            "youtube_id": "abcdefghijk",
            "playlist_index": 2,
            "title": 'Une "vidéo" & café',
            "url": "https://www.youtube.com/watch?v=abcdefghijk",
            "channel": "Créateur Éclairé",
            "duration_seconds": 125,
            "summary_markdown": "### Idée clé\n\nRésumé avec des caractères : é, &, <test>.",
            "model_used": "fixture-model",
            "provenance": {
                "source_type": "youtube",
                "source_url": "https://www.youtube.com/watch?v=abcdefghijk",
                "subtitle_format": "srt",
            },
        },
        "note": {
            "video_id": "video_fixture",
            "body": "Ma note personnelle.\n\nDeuxième ligne.",
            "excerpts_json": json.dumps(
                [{"text": "Un passage précis & utile.", "start_ms": 65_000}],
                ensure_ascii=False,
            ),
            "version": 3,
            "updated_at": "2026-09-21T10:05:00.000Z",
        },
        "transcript": [
            {"block_index": 0, "start_ms": 1_000, "end_ms": 2_000, "text": "Bonjour."},
            {
                "block_index": 1,
                "start_ms": 65_000,
                "end_ms": 67_000,
                "text": "Un passage précis & utile.",
            },
        ],
    }


def test_web_export_matches_golden_and_is_replay_safe(tmp_path: Path) -> None:
    target = graphipy.export_web_job(manifest(), [item()], tmp_path / "outbox")
    markdown = target / "0002-une-video-cafe-abcdefghijk.md"
    first_proof = (target / "_export.json").read_text(encoding="utf-8")

    assert markdown.read_text(encoding="utf-8") == GOLDEN.read_text(encoding="utf-8")

    replayed = graphipy.export_web_job(manifest(), [item()], tmp_path / "outbox")

    assert replayed == target
    assert (target / "_export.json").read_text(encoding="utf-8") == first_proof
    assert sorted(path.name for path in target.iterdir()) == [
        "0002-une-video-cafe-abcdefghijk.md",
        "_export.json",
    ]


def test_export_rejects_a_selection_mismatch_and_unavailable_outbox(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="frozen kept selection"):
        graphipy.export_web_job(manifest(), [], tmp_path / "outbox")

    unavailable = tmp_path / "not-a-directory"
    unavailable.write_text("occupied", encoding="utf-8")
    with pytest.raises(FileExistsError):
        graphipy.export_web_job(manifest(), [item()], unavailable)


def test_interrupted_export_has_no_proof_and_can_be_replayed(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original = graphipy._atomic_write_text

    def fail_before_proof(path: Path, content: str) -> None:
        if path.name == "_export.json":
            raise OSError("simulated interruption")
        original(path, content)

    monkeypatch.setattr(graphipy, "_atomic_write_text", fail_before_proof)
    with pytest.raises(OSError, match="simulated interruption"):
        graphipy.export_web_job(manifest(), [item()], tmp_path / "outbox")
    target = tmp_path / "outbox" / "job_web_fixture"
    assert not target.exists()

    monkeypatch.setattr(graphipy, "_atomic_write_text", original)
    graphipy.export_web_job(manifest(), [item()], tmp_path / "outbox")
    assert (target / "_export.json").is_file()


class ExportClient:
    def __init__(self) -> None:
        self.requested_video_ids: list[str] = []

    def fetch_export_manifest(self, *_args: Any) -> dict[str, Any]:
        return manifest()

    def fetch_export_item(
        self,
        _job_id: str,
        video_id: str,
        _worker_id: str,
        _lease_token: str,
    ) -> dict[str, Any]:
        self.requested_video_ids.append(video_id)
        return item()


def test_finalizer_fetches_only_the_frozen_manifest_items(tmp_path: Path) -> None:
    client = ExportClient()
    claim = LeaseClaim(
        job_id="job_web_fixture",
        source_url="https://www.youtube.com/playlist?list=PLfixture",
        source_kind="youtube_playlist",
        lease_token="lease-fixture",
        ready_video_occurrences=frozenset(),
        work_kind="FINALIZE",
        finalize_state="EXPORTING",
    )
    spool_root = tmp_path / "spool"
    stale_job_spool = spool_root / "job_web_fixture"
    stale_job_spool.mkdir(parents=True)
    (stale_job_spool / "completed.json").write_text("{}", encoding="utf-8")
    finalizer = GraphipyOutboxFinalizer(  # type: ignore[arg-type]
        client,
        "worker-fixture",
        tmp_path / "outbox",
        spool_root,
    )

    reference = finalizer.export(claim)
    finalizer.cleanup(claim, reference)

    assert reference == "output/graphipy_ready/job_web_fixture"
    assert client.requested_video_ids == ["video_fixture"]
    assert (tmp_path / "outbox" / "job_web_fixture" / "_export.json").is_file()
    assert not stale_job_spool.exists()
