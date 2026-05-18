from pathlib import Path

import pytest

from src.storage.retention import safe_delete


def test_safe_delete_refuses_outside_project(tmp_path: Path) -> None:
    target = tmp_path / "outside.txt"
    target.write_text("danger", encoding="utf-8")

    with pytest.raises(ValueError):
        safe_delete(target)

    assert target.exists()
