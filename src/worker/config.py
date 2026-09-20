from __future__ import annotations

import os
import platform
import re
from dataclasses import dataclass

from dotenv import load_dotenv

from src.paths import project_path


@dataclass(frozen=True, slots=True)
class WorkerConfig:
    control_plane_url: str
    worker_token: str
    worker_id: str


def load_worker_config() -> WorkerConfig:
    load_dotenv(project_path(".env"))
    control_plane_url = os.getenv("SUMMARIZER_CONTROL_PLANE_URL", "").strip()
    worker_token = os.getenv("SUMMARIZER_WORKER_TOKEN", "")
    if not control_plane_url:
        raise ValueError("SUMMARIZER_CONTROL_PLANE_URL is required.")
    if not worker_token:
        raise ValueError("SUMMARIZER_WORKER_TOKEN is required.")
    raw_worker_id = os.getenv("SUMMARIZER_WORKER_ID", "") or f"{platform.node()}-{os.getpid()}"
    worker_id = re.sub(r"[^A-Za-z0-9_-]+", "-", raw_worker_id).strip("-")[:100]
    if not worker_id:
        raise ValueError("SUMMARIZER_WORKER_ID is invalid.")
    return WorkerConfig(control_plane_url, worker_token, worker_id)
