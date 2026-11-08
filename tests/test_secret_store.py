from __future__ import annotations

import subprocess

from src.llm import secret_store
from src.llm.gemini_client import _safe_error_label


def test_keychain_secret_uses_argument_array_without_shell(monkeypatch) -> None:
    calls: list[list[str]] = []

    def fake_run(args, **kwargs):
        calls.append(args)
        assert kwargs["check"] is False
        assert kwargs["capture_output"] is True
        return subprocess.CompletedProcess(args, 0, stdout="secret-value\n", stderr="")

    monkeypatch.setattr(secret_store.sys, "platform", "darwin")
    monkeypatch.setattr(secret_store.subprocess, "run", fake_run)

    assert secret_store.get_macos_keychain_secret("geminiSummary") == "secret-value"
    assert calls == [
        [
            "/usr/bin/security",
            "find-generic-password",
            "-a",
            "geminiSummary",
            "-s",
            secret_store.KEYCHAIN_SERVICE,
            "-w",
        ]
    ]


def test_keychain_status_never_requests_secret_output(monkeypatch) -> None:
    calls: list[list[str]] = []

    def fake_run(args, **kwargs):
        calls.append(args)
        assert kwargs["stdout"] is subprocess.DEVNULL
        return subprocess.CompletedProcess(args, 0)

    monkeypatch.setattr(secret_store.sys, "platform", "darwin")
    monkeypatch.setattr(secret_store.subprocess, "run", fake_run)

    assert secret_store.has_macos_keychain_secret("geminiSummary") is True
    assert "-w" not in calls[0]


def test_keychain_is_not_used_on_other_platforms(monkeypatch) -> None:
    monkeypatch.setattr(secret_store.sys, "platform", "linux")

    assert secret_store.get_macos_keychain_secret("geminiSummary") is None
    assert secret_store.has_macos_keychain_secret("geminiSummary") is False


def test_provider_error_label_never_persists_the_raw_message() -> None:
    label = _safe_error_label(RuntimeError("request failed with private-key-material"))

    assert label == "RuntimeError"
    assert "private-key-material" not in label
