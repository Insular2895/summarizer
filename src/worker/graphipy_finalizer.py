from __future__ import annotations

from pathlib import Path
from typing import Any

from src.exporters.graphipy import export_web_job
from src.paths import project_path
from src.storage.retention import cleanup_web_job_spool
from src.worker.client import ControlPlaneClient, LeaseClaim


class GraphipyOutboxFinalizer:
    """Materialize the frozen KEPT selection in the existing local outbox."""

    def __init__(
        self,
        client: ControlPlaneClient,
        worker_id: str,
        output_dir: Path | None = None,
        spool_root: Path | None = None,
    ) -> None:
        self.client = client
        self.worker_id = worker_id
        self.output_dir = output_dir or project_path("output", "graphipy_ready")
        self.spool_root = spool_root or project_path("cache", "web_worker_spool")

    def export(self, claim: LeaseClaim) -> str:
        manifest = self.client.fetch_export_manifest(
            claim.job_id,
            self.worker_id,
            claim.lease_token,
        )
        kept = manifest.get("kept_videos")
        if not isinstance(kept, list):
            raise ValueError("Invalid frozen export manifest.")
        items: list[dict[str, Any]] = []
        for entry in kept:
            if not isinstance(entry, dict) or not isinstance(entry.get("id"), str):
                raise ValueError("Invalid frozen export item.")
            items.append(
                self.client.fetch_export_item(
                    claim.job_id,
                    entry["id"],
                    self.worker_id,
                    claim.lease_token,
                )
            )
        target = export_web_job(manifest, items, self.output_dir)
        return f"output/graphipy_ready/{target.name}"

    def cleanup(self, claim: LeaseClaim, export_reference: str) -> None:
        expected = f"output/graphipy_ready/{claim.job_id}"
        if export_reference != expected:
            raise ValueError("The confirmed export reference does not match the job.")
        cleanup_web_job_spool(claim.job_id, spool_root=self.spool_root)
