from pathlib import Path

import pytest

from src.storage.retention import cleanup_web_job_spool, safe_delete


def test_safe_delete_refuses_outside_project(tmp_path: Path) -> None:
    target = tmp_path / "outside.txt"
    target.write_text("danger", encoding="utf-8")

    with pytest.raises(ValueError):
        safe_delete(target)

    assert target.exists()


def test_web_cleanup_is_scoped_to_one_job_and_idempotent(tmp_path: Path) -> None:
    root = tmp_path / "web-worker-spool"
    job_a = root / "job_a"
    job_b = root / "job_b"
    job_a.mkdir(parents=True)
    job_b.mkdir()
    (job_a / "record.json").write_text("{}", encoding="utf-8")
    (job_b / "record.json").write_text("{}", encoding="utf-8")

    assert cleanup_web_job_spool("job_a", spool_root=root) == [job_a.resolve()]
    assert not job_a.exists()
    assert job_b.is_dir()
    assert cleanup_web_job_spool("job_a", spool_root=root) == []


def test_web_cleanup_rejects_traversal_and_outside_symlinks(tmp_path: Path) -> None:
    root = tmp_path / "web-worker-spool"
    outside = tmp_path / "canonical-transcript.txt"
    outside.write_text("keep", encoding="utf-8")
    job = root / "job_safe"
    job.mkdir(parents=True)
    (job / "outside-link").symlink_to(outside)

    with pytest.raises(ValueError):
        cleanup_web_job_spool("../job_safe", spool_root=root)
    with pytest.raises(ValueError):
        cleanup_web_job_spool("job_safe", spool_root=root)

    assert outside.read_text(encoding="utf-8") == "keep"
    assert job.exists()
