from __future__ import annotations

import re
from pathlib import Path

from src.paths import ensure_dir, project_path


def export_graphipy_ready(source_path: Path, slug: str, output_dir: Path | None = None) -> Path:
    output_dir = output_dir or project_path("output", "graphipy_ready")
    ensure_dir(output_dir)
    content = source_path.read_text(encoding="utf-8")
    content = re.sub(r"^model_used:.*\n", "", content, flags=re.MULTILINE)
    target = output_dir / f"{slug}.md"
    target.write_text(content, encoding="utf-8")
    return target


def frontmatter_video(title: str, url: str) -> str:
    return f"""---
title: "{_escape(title)}"
source_type: "youtube"
url: "{_escape(url)}"
content_value: "non précisé"
technical_level: "non précisé"
bullshit_risk: "non précisé"
graphipy_ready: true
tags:
  - video
---
"""


def frontmatter_pdf(title: str, source_file: str) -> str:
    return f"""---
title: "{_escape(title)}"
source_type: "pdf"
source_file: "{_escape(source_file)}"
domain: "non précisé"
technical_level: "non précisé"
content_value: "non précisé"
bullshit_risk: "non précisé"
graphipy_ready: true
tags:
  - pdf
  - livre
---
"""


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')
