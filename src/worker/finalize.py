from __future__ import annotations

from typing import Protocol

from src.worker.client import LeaseClaim


class JobFinalizer(Protocol):
    """Local export and cleanup boundary; the control plane confirms each step."""

    def export(self, claim: LeaseClaim) -> str: ...

    def cleanup(self, claim: LeaseClaim, export_reference: str) -> None: ...
