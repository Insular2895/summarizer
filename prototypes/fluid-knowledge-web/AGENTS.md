# Prototype Instructions

## Project-specific decisions

- The user selected **Fluid Knowledge** as the visual direction on 2026-11-06.
- The latest radius decision supersedes earlier larger rounding: use 12px for windows, 10px for
  cards and major actions, 8px for panels, 6px for compact controls and 5px for nested controls.
  Preserve circles and true pill-shaped progress/status elements only; ordinary buttons are never
  capsules.
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
- Persist the current Review card as `currentIndex` in the same server session and local fallback.
  When the browser has lost its active-job pointer, restore the latest unfinished job only from the
  server's non-sensitive session summary, then hydrate decisions, notes and deep dives through the
  targeted session route. Never expose note content in the job list.
- When revisiting saved cards, show compact memory markers for the prior keep/discard decision, a
  non-empty note and any saved AI conversation. These are read-only summaries of existing state;
  opening the detail remains the place to inspect or edit the saved content.
- The video thumbnail is an accessible secondary entry point to the full card on every viewport;
  dragging the card must never trigger that click accidentally. When the ChatGPT fallback is opened
  after a Gemini deep dive, its bounded copied prompt must include the current Gemini answer so the
  user can continue from the work already completed instead of restarting from the raw excerpt.
- The latest 2026-11-13 review feedback keeps Geist and the Fluid Knowledge structure but supersedes
  the persistent semantic decision colors and 16:9 media slot: Keep and Discard are neutral at rest
  and use no colored strokes. Semantic color belongs to the moving-card tint described below. The
  genuine thumbnail returns to the former full-height/full-width media format with a centered
  `cover` crop. Clicking
  anywhere on the card opens the detail unless the user is dragging or activating a nested control.
  Hide decorative shortcut/keycap icons while preserving ArrowLeft, ArrowRight and Command/Ctrl+Z.
- Gemini deep dives form one persistent bounded conversation per video. Follow-up requests send the
  recent user/assistant history to the server, use a compact video context after the first turn, and
  keep every saved turn compatible with Notes, ZIP/PDF and the private Maxi Brain export.
- The latest interaction decision supersedes the former no-swipe rule inside the reading sheet:
  Enter opens the active Review card, and a deliberate horizontal swipe can start anywhere in the
  sheet—including summary text, tabs, links, buttons and Note/AI controls—before keeping or
  discarding it. Preserve simple clicks, typing, vertical scrolling and Undo; require a horizontal
  threshold, suppress the nested click after a drag and clear incidental text selection only once
  the movement has locked horizontally.
- Arbitrate gestures that start on readable text before locking the sheet: a deliberate native text
  selection wins, a quick horizontal flick remains a decision swipe, and vertical movement remains
  scrolling. Once recognized, keep selection, horizontal swipe or vertical scroll locked for the
  rest of that pointer gesture.
- While the reading sheet is open, ArrowUp and ArrowDown scroll its internal reading viewport and may
  repeat while held. Do not intercept those keys from inputs, textareas or editable controls.
- The latest Review polish removes the `Ensuite` panel. On desktop, `À retenir` and `Raccourcis`
  form two equal-height rows aligned to the combined card and decision-control height; tablet uses
  two equal columns and mobile stacks both panels. Use Radix Bookmark and Lightning Bolt icons in
  restrained neutral glass containers.
- The latest 2026-11-13 Liquid Glass pass supersedes solid decision-button feedback and colored
  panels behind the card. Decision and Undo controls use regular-material-inspired translucent
  rounded rectangles with a bright upper specular edge, a darker lower edge, backdrop blur and a
  restrained lift/press response. During a swipe, a direction-dependent green or red layer tints the card (or
  open reading sheet) itself while it rotates; never reveal a colored underlay behind it. The tint
  is a directional black-to-semantic gradient: black on the trailing edge, green on the right exit
  and red on the left exit. Keep the reading-sheet tint pinned to the complete visible dialog viewport
  while its summary and workspace content scroll beneath it.
- Reuse that restrained material hierarchy across navigation selection, progress containers, context
  panels, source/history/completion surfaces, dialogs, tabs, Note & IA and primary/secondary actions.
  Use neutral, blue-tinted or red-tinted glass according to function without adding colored strokes.
- Treat the active `Review` navigation button as the material reference for every interactive glass
  control: an off-center white light hotspot, cool translucent gradient, subtle lower edge and short
  shadow. Reuse the same lighting construction for neutral, blue and destructive red actions; only
  the functional tint changes.
- Extend that lighting language to every card surface with a wider, softer hotspot and broader depth:
  Review card/deck, context panels, Home and History containers, completion/export cards, dialogs,
  API fields, Note & IA and assistant responses. The authentic thumbnail itself remains unfiltered
  and unmodified.
- The API-key dialog uses one strict repeated card grid: three equal-height key cards, 44px inputs,
  a full-width title/description header and a quiet sync state inside each input. The Google callout,
  inline states and security/advice cards reuse the same illuminated material; do not mix flat gray
  boxes with glass cards in this dialog.
- API-key fields own their secure lifecycle automatically: a valid replacement is saved after a
  short debounce or blur, clearing the masked field removes the stored key, and no Configure, Save
  or Remove buttons are shown. Keep Gemini as the only active Web provider until the OpenAI and
  Anthropic adapters are wired through the same server-side secret boundary; copy may describe
  those compatible future choices but must not imply that they work in the current Web UI.
- Use the installed `SiGooglegemini` brand mark throughout Note & IA instead of a generic magic wand:
  selection context, empty conversation, assistant identity and Gemini submit action. Use restrained
  system icons for adjacent semantics—circled check/reload for autosave and chat bubble for the
  conversation label—at consistent optical sizes.
- Never apply an extra CSS zoom to genuine YouTube thumbnails. Prefer `maxresdefault` when YouTube
  provides it, fall back to `hqdefault`, keep the source centered in the established media slot and
  avoid transforms that magnify low-resolution pixels.
- Review displays the genuine red YouTube SVG mark directly from React Icons Simple Icons, without
  a surrounding bubble, background, border or shadow. Never use the `YT` text abbreviation or a
  hand-drawn approximation; keep the adjacent source label readable.
- All decision swipe exits use an ease-in-out acceleration curve. The open reading sheet supports
  ArrowLeft/ArrowRight and mirrors the card with horizontal translation plus a clamped ±7° rotation;
  reduced motion still removes the travel without removing the decision.
- The 2026-11-15 user review rejected the free Unicorn embed because its published output tiles a
  visible Unicorn watermark and its motion was too subtle. Keep the ambient background entirely
  local with `src/assets/summariz-pearl-ribbons.webp`: two fixed, non-interactive image layers,
  26s/34s transform-and-opacity cycles and pointer parallax bounded to 9px horizontally and 6px
  vertically. It must remain almost white, visually quiet, behind every surface and free of
  saturated color, particles or continuous spins. On reduced motion, keep one static layer and hide
  the secondary layer. Do not add an external WebGL/runtime dependency or republish the free Unicorn
  scene. Reconsider Unicorn only after explicit validation of a watermark-free licensed output.
- The 2026-11-15 premium-refinement test uses the second generated Review direction: one unified
  desktop surface contains the existing video card and a macOS-style right inspector, while the
  decision row remains directly below. Keep the existing `current / total` plus percentage progress
  chip exactly as-is; do not replace it with the generated mock's ready/reviewed/kept counters. The
  test is deliberately reversible through `REVIEW_LAYOUT_VARIANT` in `src/App.jsx`: the URL query
  `?reviewLayout=legacy` restores the prior desktop composition without touching data, swipe, notes
  or history.
  The selected test also permits a restrained blue emphasis on the desktop Keep button while Discard
  stays neutral and Undo tertiary. Tablet and mobile retain their existing responsive composition.
- Keep a visible `Actions possibles` section directly beside the Review card, underneath `À retenir`.
  It exposes the concrete actions extracted from the video sheet's `## Actions possibles` section,
  not the Review controls or keyboard shortcuts. Never invent an action when the source section is
  absent; show an explicit empty state instead.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
