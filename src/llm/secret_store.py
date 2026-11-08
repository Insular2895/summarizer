from __future__ import annotations

import subprocess
import sys

KEYCHAIN_SERVICE = "com.graphipy.transcript.api-keys"


def get_macos_keychain_secret(*accounts: str) -> str | None:
    """Return the first matching Keychain secret without logging or shell interpolation."""
    if sys.platform != "darwin":
        return None
    for account in accounts:
        try:
            result = subprocess.run(
                [
                    "/usr/bin/security",
                    "find-generic-password",
                    "-a",
                    account,
                    "-s",
                    KEYCHAIN_SERVICE,
                    "-w",
                ],
                check=False,
                capture_output=True,
                text=True,
                timeout=10,
                env={"PATH": "/usr/bin:/bin"},
            )
        except (OSError, subprocess.SubprocessError):
            continue
        secret = result.stdout.rstrip("\r\n") if result.returncode == 0 else ""
        if secret:
            return secret
    return None


def has_macos_keychain_secret(*accounts: str) -> bool:
    """Check Keychain item existence without asking it to print the secret."""
    if sys.platform != "darwin":
        return False
    for account in accounts:
        try:
            result = subprocess.run(
                [
                    "/usr/bin/security",
                    "find-generic-password",
                    "-a",
                    account,
                    "-s",
                    KEYCHAIN_SERVICE,
                ],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=10,
                env={"PATH": "/usr/bin:/bin"},
            )
        except (OSError, subprocess.SubprocessError):
            continue
        if result.returncode == 0:
            return True
    return False
