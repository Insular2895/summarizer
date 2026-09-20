from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


@dataclass(frozen=True, slots=True)
class LeaseClaim:
    job_id: str
    source_url: str
    source_kind: str
    lease_token: str
    ready_youtube_ids: frozenset[str]


class ControlPlaneClient(Protocol):
    def claim(self, worker_id: str, lease_seconds: int) -> LeaseClaim | None: ...

    def heartbeat(
        self,
        job_id: str,
        worker_id: str,
        lease_token: str,
        lease_seconds: int,
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
        ready_ids = lease.get("ready_youtube_ids", [])
        if not isinstance(ready_ids, list) or not all(isinstance(item, str) for item in ready_ids):
            raise ControlPlaneError(502, "INVALID_CLAIM_RESPONSE", retryable=False)
        return LeaseClaim(
            job_id=_string(job, "id"),
            source_url=_string(source, "normalized_url"),
            source_kind=_string(source, "source_kind"),
            lease_token=_string(lease, "lease_token"),
            ready_youtube_ids=frozenset(ready_ids),
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
