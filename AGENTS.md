# Agent Instructions

Before changing code in this repository, read [AI_MAINTENANCE.md](AI_MAINTENANCE.md).

Important defaults:

- Keep user files private: never commit `.env`, `cookies.txt`, PDFs, outputs, cache files or local playlists.
- Keep the public UX simple: prefer `./runpdf`, `./runyoutube` and `./runhelp` in docs.
- Preserve the local pipeline design: `input/` for sources, `cache/` for temporary files, `output/` for final Markdown, `prompts/` for prompts.
- For YouTube playlists, process video by video and never delete global outputs.
- For PDFs, keep multiple extraction fallbacks and do not send empty or poor extraction results to Gemini.
- Run formatting, linting, tests and a secret scan before committing.
