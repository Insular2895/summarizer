from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Literal, Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


@dataclass(frozen=True, slots=True)
class LeaseClaim:
    job_id: str
    source_url: str
    source_kind: str
    lease_token: str
    ready_video_occurrences: frozenset[tuple[str, int]]
    work_kind: Literal["PROCESS", "FINALIZE"] = "PROCESS"
    finalize_state: str = "NOT_STARTED"
    export_reference: str | None = None


class ControlPlaneClient(Protocol):
    def claim(self, worker_id: str, lease_seconds: int) -> LeaseClaim | None: ...

    def heartbeat(
        self,
        job_id: str,
        worker_id: str,
        lease_token: str,
        lease_seconds: int,
    ) -> None: ...

    def publish_plan(
        self,
        job_id: str,
        worker_id: str,
        lease_token: str,
        payload: dict[str, Any],
    ) -> None: ...

    def publish_event(
        self,
        job_id: str,
        worker_id: str,
        lease_token: str,
        payload: dict[str, Any],
    ) -> None: ...

    def publish_result(
        self,
        job_id: str,
        video_id: str,
        worker_id: str,
        lease_token: str,
        payload: dict[str, Any],
    ) -> None: ...

    def publish_error(
        self,
        job_id: str,
        video_id: str,
        worker_id: str,
        lease_token: str,
        payload: dict[str, Any],
    ) -> None: ...

    def complete(self, job_id: str, worker_id: str, lease_token: str) -> None: ...

    def fetch_export_manifest(
        self,
        job_id: str,
        worker_id: str,
        lease_token: str,
    ) -> dict[str, Any]: ...

    def fetch_export_item(
        self,
        job_id: str,
        video_id: str,
        worker_id: str,
        lease_token: str,
    ) -> dict[str, Any]: ...

    def report_export(
        self,
        job_id: str,
        worker_id: str,
        lease_token: str,
        *,
        success: bool,
        export_reference: str | None,
        cleanup_complete: bool,
        diagnostic_code: str | None = None,
    ) -> None: ...


class ControlPlaneError(RuntimeError):
    def __init__(self, status: int | None, diagnostic_code: str, *, retryable: bool) -> None:
        super().__init__(f"Control plane request failed ({diagnostic_code}).")
        self.status = status
        self.diagnostic_code = diagnostic_code
        self.retryable = retryable


class HttpControlPlaneClient:
    def __init__(self, base_url: str, worker_token: str, timeout_seconds: float = 20) -> None:
        self.base_url = _validate_base_url(base_url)
        if not worker_token:
            raise ValueError("SUMMARIZER_WORKER_TOKEN is required.")
        self._worker_token = worker_token
        self.timeout_seconds = timeout_seconds

    def claim(self, worker_id: str, lease_seconds: int) -> LeaseClaim | None:
        status, response = self._request(
            "POST",
            "/api/worker/jobs/claim",
            {"worker_id": worker_id, "lease_seconds": lease_seconds},
        )
        if status == 204:
            return None
        lease = _object(response, "lease")
        job = _object(lease, "job")
        source = _object(lease, "source")
        work_kind = lease.get("work_kind")
        if work_kind not in {"PROCESS", "FINALIZE"}:
            raise ControlPlaneError(502, "INVALID_CLAIM_RESPONSE", retryable=False)
        ready_items = lease.get("ready_video_occurrences", [])
        if not isinstance(ready_items, list):
            raise ControlPlaneError(502, "INVALID_CLAIM_RESPONSE", retryable=False)
        ready_occurrences: set[tuple[str, int]] = set()
        for item in ready_items:
            if not isinstance(item, dict):
                raise ControlPlaneError(502, "INVALID_CLAIM_RESPONSE", retryable=False)
            youtube_id = item.get("youtube_id")
            playlist_index = item.get("playlist_index")
            if not isinstance(youtube_id, str) or not isinstance(playlist_index, int):
                raise ControlPlaneError(502, "INVALID_CLAIM_RESPONSE", retryable=False)
            ready_occurrences.add((youtube_id, playlist_index))
        return LeaseClaim(
            job_id=_string(job, "id"),
            source_url=_string(source, "normalized_url"),
            source_kind=_string(source, "source_kind"),
            lease_token=_string(lease, "lease_token"),
            ready_video_occurrences=frozenset(ready_occurrences),
            work_kind=work_kind,
            finalize_state=_string(job, "finalize_state"),
            export_reference=(
                job.get("export_reference")
                if isinstance(job.get("export_reference"), str)
                else None
            ),
        )

    def heartbeat(
        self,
        job_id: str,
        worker_id: str,
        lease_token: str,
        lease_seconds: int,
    ) -> None:
        self._request(
            "POST",
            f"/api/worker/jobs/{job_id}/heartbeat",
            {
                "worker_id": worker_id,
                "lease_token": lease_token,
                "lease_seconds": lease_seconds,
            },
        )

    def publish_plan(
        self,
        job_id: str,
        worker_id: str,
        lease_token: str,
        payload: dict[str, Any],
    ) -> None:
        self._request(
            "PUT",
            f"/api/worker/jobs/{job_id}/plan",
            {**payload, "worker_id": worker_id, "lease_token": lease_token},
        )

    def publish_event(
        self,
        job_id: str,
        worker_id: str,
        lease_token: str,
        payload: dict[str, Any],
    ) -> None:
        self._request(
            "POST",
            f"/api/worker/jobs/{job_id}/events",
            {**payload, "worker_id": worker_id, "lease_token": lease_token},
        )

    def publish_result(
        self,
        job_id: str,
        video_id: str,
        worker_id: str,
        lease_token: str,
        payload: dict[str, Any],
    ) -> None:
        self._request(
            "PUT",
            f"/api/worker/jobs/{job_id}/videos/{video_id}/result",
            {**payload, "worker_id": worker_id, "lease_token": lease_token},
        )

    def publish_error(
        self,
        job_id: str,
        video_id: str,
        worker_id: str,
        lease_token: str,
        payload: dict[str, Any],
    ) -> None:
        self._request(
            "PUT",
            f"/api/worker/jobs/{job_id}/videos/{video_id}/error",
            {**payload, "worker_id": worker_id, "lease_token": lease_token},
        )

    def complete(self, job_id: str, worker_id: str, lease_token: str) -> None:
        self._request(
            "POST",
            f"/api/worker/jobs/{job_id}/complete",
            {"worker_id": worker_id, "lease_token": lease_token},
        )

    def fetch_export_manifest(
        self,
        job_id: str,
        worker_id: str,
        lease_token: str,
    ) -> dict[str, Any]:
        _, response = self._request(
            "POST",
            f"/api/worker/jobs/{job_id}/export-manifest",
            {"worker_id": worker_id, "lease_token": lease_token},
        )
        return _object(response, "manifest")

    def fetch_export_item(
        self,
        job_id: str,
        video_id: str,
        worker_id: str,
        lease_token: str,
    ) -> dict[str, Any]:
        _, response = self._request(
            "POST",
            f"/api/worker/jobs/{job_id}/export-items/{video_id}",
            {"worker_id": worker_id, "lease_token": lease_token},
        )
        return _object(response, "item")

    def report_export(
        self,
        job_id: str,
        worker_id: str,
        lease_token: str,
        *,
        success: bool,
        export_reference: str | None,
        cleanup_complete: bool,
        diagnostic_code: str | None = None,
    ) -> None:
        self._request(
            "POST",
            f"/api/worker/jobs/{job_id}/export-result",
            {
                "worker_id": worker_id,
                "lease_token": lease_token,
                "success": success,
                "export_reference": export_reference,
                "cleanup_complete": cleanup_complete,
                "diagnostic_code": diagnostic_code,
            },
        )

    def _request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any],
    ) -> tuple[int, dict[str, Any] | None]:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = Request(
            f"{self.base_url}{path}",
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self._worker_token}",
                "Content-Type": "application/json",
                "User-Agent": "summarizer-web-worker/1",
            },
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:  # noqa: S310
                status = response.status
                content = response.read()
        except HTTPError as error:
            diagnostic_code = _diagnostic_code(error.read())
            raise ControlPlaneError(
                error.code,
                diagnostic_code,
                retryable=error.code == 429 or error.code >= 500,
            ) from None
        except (URLError, TimeoutError):
            raise ControlPlaneError(None, "CONTROL_PLANE_UNAVAILABLE", retryable=True) from None

        if status == 204 or not content:
            return status, None
        try:
            decoded = json.loads(content)
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ControlPlaneError(
                status, "INVALID_CONTROL_PLANE_RESPONSE", retryable=False
            ) from None
        if not isinstance(decoded, dict):
            raise ControlPlaneError(status, "INVALID_CONTROL_PLANE_RESPONSE", retryable=False)
        return status, decoded


def _validate_base_url(value: str) -> str:
    from urllib.parse import urlparse

    normalized = value.strip().rstrip("/")
    parsed = urlparse(normalized)
    local_hosts = {"localhost", "127.0.0.1", "::1"}
    if parsed.scheme != "https" and not (
        parsed.scheme == "http" and parsed.hostname in local_hosts
    ):
        raise ValueError(
            "The control plane URL must use HTTPS (HTTP is allowed for localhost only)."
        )
    if not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Invalid control plane URL.")
    return normalized


def _diagnostic_code(body: bytes) -> str:
    try:
        decoded = json.loads(body)
        code = decoded.get("error", {}).get("diagnostic_code")
        return code if isinstance(code, str) else "CONTROL_PLANE_HTTP_ERROR"
    except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
        return "CONTROL_PLANE_HTTP_ERROR"


def _object(value: dict[str, Any] | None, key: str) -> dict[str, Any]:
    item = value.get(key) if value else None
    if not isinstance(item, dict):
        raise ControlPlaneError(502, "INVALID_CLAIM_RESPONSE", retryable=False)
    return item


def _string(value: dict[str, Any], key: str) -> str:
    item = value.get(key)
    if not isinstance(item, str) or not item:
        raise ControlPlaneError(502, "INVALID_CLAIM_RESPONSE", retryable=False)
    return item
