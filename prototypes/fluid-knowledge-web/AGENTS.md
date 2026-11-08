# Prototype Instructions

## Project-specific decisions

- The user selected **Fluid Knowledge** as the visual direction on 2026-11-06.
- The user refined that direction on 2026-11-08: use restrained Apple-like corner radii instead of
  oversized generative-AI-style rounding. Outer windows/cards use about 18px, nested panels 12–16px
  and controls 8–10px; preserve circles and true pill-shaped status elements.
- The user refined the direction again on 2026-11-08 using Damir Sokolovsky's Unslop method: keep
  the Apple character, but use quieter chrome, a strict 4px rhythm, lighter type hierarchy, one blue
  accent, semantic green/red only, flatter surfaces and the genuine video thumbnail as the single
  rich visual moment. Preserve product structure and behavior; this is a polish pass, not a redesign.
- Visual source of truth: `../../docs/assets/web-v1-fluid-knowledge-review-mobile.png`.
- This project is the responsive Web/PC adaptation. Desktop uses a navigation rail, central review
  workspace and contextual side panel; mobile collapses to one column with bottom navigation.
- Use the real YouTube thumbnail supplied by video metadata whenever it is available. Generated
  imagery is fallback-only.
- For playlist prototypes, use the current long Markdown summaries under `output/videos/` as the
  content source. Never replace them with invented summaries. If a real thumbnail cannot be
  fetched, show the neutral unavailable state instead of generating or approximating one.
- Preserve visible Keep/Discard buttons, Undo, keyboard parity, reduced motion and an interruptible
  horizontal card gesture at every breakpoint.
- Review ends after the last decision instead of looping. The completion surface offers a portable
  Markdown ZIP and a clean PDF. The private Maxi Brain destination is capability-gated and must
  never appear in a public environment without the local connector.
- History separates the active session from completed export receipts. Removing a completed receipt
  never deletes summaries, transcripts, source files, downloads or canonical library content.
- In the large reading view, keep the unique video Note visible beside the summary on desktop and
  tablet. On mobile, expose the same Note and contextual AI tools in a bottom sheet; do not squeeze
  them into a second column.
- A user can select a summary passage, ask Gemini to deepen it, then explicitly copy the answer or
  add it to the Note. Gemini calls stay server-side and use the existing Python client. The ChatGPT
  fallback copies a bounded prompt and opens the official ChatGPT site; do not invent an unsupported
  prefilled URL contract.
- Notes belong to their video and travel with every kept-video export: Markdown ZIP, clean PDF and
  the private Maxi Brain connector.
- Name the provider settings surface **Clés API**, not “Clés Gemini”, so other providers can be
  added later. Present Google as the active provider and state that Google offers free Gemini keys
  under project quotas, with a link to the official creation guide.
- On first Gemini use without a configured key, open Clés API. When Gemini reports quota exhaustion,
  show a blocking recovery dialog that explains both summaries and deep-dives may be affected and
  links back to Clés API. A configured Keychain item bypasses first-use onboarding.
- Support separate Gemini keys for summaries and deep-dives, while warning that two keys in the same
  Google project generally share the same quota. Never return stored key values to the browser.
- On macOS, persist API keys only in the Keychain service `com.graphipy.transcript.api-keys`. Never
  use a plaintext JSON file, browser storage or a committed `.env`. A legacy `.env` migration must
  verify the Keychain write before atomically removing only Gemini key lines.
- Pass a secret to a child process through bounded stdin, never command arguments or child environment.
  UI tests use the in-memory backend only; the dedicated integration test uses an isolated Keychain
  service and removes its fake entries. Production requires a per-user encrypted vault/KMS and must
  never expose an admin reveal route.
- Bind the local prototype to loopback by default. Key, Gemini and private Maxi Brain routes reject
  non-loopback clients; every mutation also requires an explicit matching browser Origin.
- Treat each submitted YouTube URL as an independent resumable job. Never reuse the archived
  Playlist 32 state for a new source, and never impose an artificial playlist-length limit.
- Process long YouTube playlists in persistent batches of 50 while preserving one continuous review.
  Surface the active batch in the UI, keep completed cards readable during quota pauses, and resume
  from the manifest instead of restarting completed videos.
- Persist decisions, per-video notes and Gemini deep dives as soon as they change. A swipe must not
  be required to save text that the user already entered.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
