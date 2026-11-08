from __future__ import annotations

import json
import os
import time
from contextlib import suppress
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from src.paths import assert_inside, ensure_dir

RecordKind = Literal["plan", "event", "result", "error"]


@dataclass(frozen=True, slots=True)
class OutboxRecord:
    record_id: str
    kind: RecordKind
    job_id: str
    video_id: str | None
    payload: dict[str, Any]
    created_at_ns: int


class SpoolCorruptionError(RuntimeError):
    pass


class WorkerSpool:
    def __init__(self, root: Path) -> None:
        self.root = ensure_dir(root)
        self.root.chmod(0o700)

    def enqueue(
        self,
        kind: RecordKind,
        job_id: str,
        payload: dict[str, Any],
        *,
        video_id: str | None = None,
    ) -> OutboxRecord:
        created_at_ns = time.time_ns()
        record = OutboxRecord(
            record_id=f"out_{uuid4().hex}",
            kind=kind,
            job_id=job_id,
            video_id=video_id,
            payload=payload,
            created_at_ns=created_at_ns,
        )
        directory = self._job_dir(job_id)
        filename = f"{created_at_ns:020d}_{record.record_id}.json"
        self._atomic_json(directory / filename, asdict(record))
        return record

    def records(self, job_id: str) -> list[tuple[Path, OutboxRecord]]:
        directory = self._job_dir(job_id, create=False)
        if not directory.exists():
            return []
        records: list[tuple[Path, OutboxRecord]] = []
        for path in sorted(directory.glob("*.json")):
            if path.name == "pipeline-complete.json":
                continue
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                record = OutboxRecord(**data)
            except (OSError, TypeError, json.JSONDecodeError) as error:
                raise SpoolCorruptionError(f"Invalid worker spool record: {path.name}") from error
            if (
                record.job_id != job_id
                or record.kind not in {"plan", "event", "result", "error"}
                or not isinstance(record.payload, dict)
                or (record.video_id is not None and not isinstance(record.video_id, str))
            ):
                raise SpoolCorruptionError(f"Mismatched worker spool record: {path.name}")
            records.append((path, record))
        return records

    def acknowledge(self, path: Path) -> None:
        assert_inside(path, self.root).unlink(missing_ok=True)

    def mark_pipeline_complete(self, job_id: str) -> None:
        self._atomic_json(
            self._job_dir(job_id) / "pipeline-complete.json",
            {"job_id": job_id, "complete": True},
        )

    def pipeline_complete(self, job_id: str) -> bool:
        marker = self._job_dir(job_id, create=False) / "pipeline-complete.json"
        return marker.is_file()

    def mark_pipeline_incomplete(self, job_id: str) -> None:
        marker = self._job_dir(job_id, create=False) / "pipeline-complete.json"
        assert_inside(marker, self.root).unlink(missing_ok=True)

    def clear_completed_job(self, job_id: str) -> None:
        directory = self._job_dir(job_id, create=False)
        if not directory.exists():
            return
        if self.records(job_id):
            raise RuntimeError("Cannot clear a worker spool with pending records.")
        marker = directory / "pipeline-complete.json"
        assert_inside(marker, self.root).unlink(missing_ok=True)
        with suppress(OSError):
            assert_inside(directory, self.root).rmdir()

    def _job_dir(self, job_id: str, *, create: bool = True) -> Path:
        safe_job_id = "".join(
            character for character in job_id if character.isalnum() or character in "_-"
        )
        if safe_job_id != job_id or not safe_job_id:
            raise ValueError("Invalid job id for worker spool.")
        directory = assert_inside(self.root / safe_job_id, self.root)
        if create:
            ensure_dir(directory)
            directory.chmod(0o700)
        return directory

    def _atomic_json(self, path: Path, value: dict[str, Any]) -> None:
        path = assert_inside(path, self.root)
        temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        try:
            temporary.write_text(json.dumps(value, ensure_ascii=False) + "\n", encoding="utf-8")
            temporary.chmod(0o600)
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
