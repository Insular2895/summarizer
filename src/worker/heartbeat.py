from __future__ import annotations

import threading

from src.worker.client import ControlPlaneClient


class LeaseHeartbeat:
    def __init__(
        self,
        *,
        client: ControlPlaneClient,
        job_id: str,
        worker_id: str,
        lease_token: str,
        lease_seconds: int,
        interval_seconds: float,
    ) -> None:
        self.client = client
        self.job_id = job_id
        self.worker_id = worker_id
        self.lease_token = lease_token
        self.lease_seconds = lease_seconds
        self.interval_seconds = interval_seconds
        self._stop = threading.Event()
        self._lost = threading.Event()
        self._thread = threading.Thread(
            target=self._run,
            name=f"lease-heartbeat-{job_id}",
            daemon=True,
        )

    @property
    def lost(self) -> bool:
        return self._lost.is_set()

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread.is_alive():
            self._thread.join(timeout=max(1.0, self.interval_seconds * 2))

    def _run(self) -> None:
        while not self._stop.wait(self.interval_seconds):
            try:
                self.client.heartbeat(
                    self.job_id,
                    self.worker_id,
                    self.lease_token,
                    self.lease_seconds,
                )
            except Exception:
                self._lost.set()
                return
