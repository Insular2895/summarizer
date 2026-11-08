from __future__ import annotations

import re
from datetime import datetime, timedelta
from pathlib import Path

from src.paths import assert_inside, project_path

ALLOWED_DELETE_ROOTS = (project_path("cache"), project_path("output"))


def safe_delete(path: Path) -> None:
    resolved = path.resolve()
    if not any(_is_inside(resolved, root.resolve()) for root in ALLOWED_DELETE_ROOTS):
        raise ValueError(f"Refusing to delete outside cache/ or output/: {resolved}")
    if resolved.is_dir():
        for child in resolved.iterdir():
            safe_delete(child)
        resolved.rmdir()
    elif resolved.exists():
        resolved.unlink()


def cleanup_cache(dry_run: bool = False) -> list[Path]:
    return _delete_children(project_path("cache"), dry_run=dry_run)


def cleanup_outputs_older_than(days: int, dry_run: bool = False) -> list[Path]:
    cutoff = datetime.now().timestamp() - timedelta(days=days).total_seconds()
    output = project_path("output")
    targets = [
        path
        for path in output.rglob("*")
        if path.is_file() and path.name != ".gitkeep" and path.stat().st_mtime < cutoff
    ]
    if not dry_run:
        for target in targets:
            safe_delete(assert_inside(target, output))
    return targets


def cleanup_all_temp(dry_run: bool = False) -> list[Path]:
    return cleanup_cache(dry_run=dry_run)


def cleanup_web_job_spool(
    job_id: str,
    *,
    spool_root: Path | None = None,
    dry_run: bool = False,
) -> list[Path]:
    """Delete only the reconstructible worker spool directory for one finalized job."""
    if not re.fullmatch(r"[A-Za-z0-9_-]+", job_id):
        raise ValueError("Invalid job id for targeted cleanup.")
    root = (spool_root or project_path("cache", "web_worker_spool")).resolve()
    target = assert_inside(root / job_id, root)
    if not target.exists():
        return []
    if not target.is_dir():
        raise ValueError("The targeted worker spool is not a directory.")

    # Validate the complete tree before deleting anything so a symlink cannot
    # turn a targeted cleanup into a partial or out-of-root deletion.
    for candidate in target.rglob("*"):
        if candidate.is_symlink():
            raise ValueError("Symlinks are not allowed in a targeted worker cleanup.")
        assert_inside(candidate, root)
    if not dry_run:
        _safe_delete_under(target, root)
    return [target]


def _delete_children(root: Path, dry_run: bool) -> list[Path]:
    targets = [path for path in root.iterdir()] if root.exists() else []
    if not dry_run:
        for target in targets:
            safe_delete(assert_inside(target, root))
    return targets


def _is_inside(path: Path, root: Path) -> bool:
    return path == root or root in path.parents


def _safe_delete_under(path: Path, root: Path) -> None:
    resolved = assert_inside(path, root)
    if resolved.is_dir():
        for child in resolved.iterdir():
            _safe_delete_under(child, root)
        resolved.rmdir()
    elif resolved.exists():
        resolved.unlink()
