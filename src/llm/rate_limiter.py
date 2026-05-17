from __future__ import annotations

import time
from dataclasses import dataclass


@dataclass
class RateLimiter:
    min_interval_seconds: float = 0.0
    _last_call: float = 0.0

    def wait(self) -> None:
        if self.min_interval_seconds <= 0:
            return
        elapsed = time.monotonic() - self._last_call
        if elapsed < self.min_interval_seconds:
            time.sleep(self.min_interval_seconds - elapsed)
        self._last_call = time.monotonic()
