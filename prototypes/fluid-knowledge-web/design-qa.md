# Fluid Knowledge Web/PC — Design QA

## 2026-11-15 — Test Review, carte unifiée sélectionnée

Source visual truth :
`/Users/insular/.codex/generated_images/01a1b293-165f-7343-8ec4-5dde49a71502/exec-a970af56-ab3f-4186-8e11-6c24ab37d509.png`, seconde direction choisie par
l'utilisateur. La source mesure 1487 × 1058 px.

### User overrides

- La progression existante `x sur y` et son pourcentage restent la seule progression affichée.
- Le bloc **Actions possibles** doit rester visible à côté de **À retenir**, sans ouvrir la fiche,
  et reprendre les actions de la source plutôt que les commandes de Review.
- Cette composition est un test réversible ; `?reviewLayout=legacy` restitue la composition desktop
  précédente sans modifier les données ni l'état de Review.

### Implementation

- Sur desktop, la miniature, le résumé et l'inspecteur forment une surface Review unifiée de 430 px.
  L'inspecteur contient **À retenir**, puis les actions concrètes extraites de la section
  `## Actions possibles` de la fiche. Les commandes de Review n'occupent plus ce second bloc.
- La ligne de décision reste sous la surface. `Garder` reçoit une légère matière bleue ; `Écarter`
  reste neutre et Undo tertiaire.
- La composition responsive existante est conservée sur tablette et mobile afin de ne pas dégrader
  les gestes, la densité et les zones tactiles déjà validées.
- La miniature authentique YouTube et les données dynamiques remplacent naturellement l'image et le
  texte de démonstration de la source.

### Comparison evidence

- Desktop final :
  `docs/audits/summariz-premium-refonte-2026-11-15/08-integrated-review-desktop.png`.
- Tablette et mobile : `09-integrated-review-tablet.png` et `10-integrated-review-mobile.png`.
- Comparaison complète : `11-source-vs-implementation.png`.
- Comparaison centrée sur la carte : `12-card-focused-comparison.png`.
- Validation avec les données réelles de la playlist 40 : `13-source-actions-desktop.png`. La carte
  active reprend fidèlement le message source « Pas d'action directe fiable extraite du transcript »
  au lieu d'afficher les commandes de Review.
- Viewport d'implémentation : 1440 × 1024 CSS px à device scale 1, Review par défaut et mouvement
  réduit pour stabiliser la capture. La comparaison complète normalise les deux rendus à 720 × 512.

### Findings and verification

- Aucun écart P0, P1 ou P2 après l'ajustement de la hauteur, l'espacement de la progression et le
  renommage du bloc d'actions.
- Écart P3 accepté : la carte implémentée commence légèrement plus haut et reste un peu plus compacte
  que la source afin de préserver l'en-tête et la progression actuels.
- Full responsive UI suite : 54 passed, 45 intentional viewport skips. Le nouveau contrôle couvre
  les actions de source sur desktop, tablette et mobile.
- Extraction de données : 3 tests passed, incluant les actions structurées, l'absence d'action fiable
  et l'absence complète de section sans fallback inventé.
- Production build : passed. Sites packaging : 4 passed. `git diff --check` : passed.
- Navigation Review → History → Review contrôlée sans erreur console.

Final result: passed.

## 2026-11-15 — Retrait Unicorn et retour au fond local

### Review finding

- Le rendu réellement publié contient un motif `Unicorn` répété sur toute la surface. La tarification
  officielle confirme que les publications du plan Free incluent le branding Unicorn.
- Deux captures publiées à 0 et 10 secondes sont presque identiques : l'animation native était trop
  faible pour être perceptible dans l'application.

### Resolution

- Le composant Unicorn, le Project ID embarqué et la dépendance `unicornstudio@2.6.0` sont supprimés.
- Le fond revient aux deux images locales déjà validées, avec animation CSS 26s/34s et parallaxe
  borné. Aucun réseau, runtime WebGL ou filigrane n'intervient désormais.
- `prefers-reduced-motion` conserve le plan principal statique et masque le plan secondaire.

### Verification

- Production build: passed. Les chunks `unicornStudio` et `model-renderer` ne sont plus émis ; seul
  l'asset WebP local hashé reste dans le bundle pour ce fond.
- Targeted background checks: 4 passed, 2 intentional viewport skips.
- Full responsive UI suite: 50 passed, 43 intentional viewport/environment skips.
- Sites packaging: 4 passed. `git diff --check`: passed.

## 2026-11-15 — Fond Unicorn Studio natif

Statut : retiré après revue utilisateur ; historique uniquement.

Source visual truth: `src/assets/summariz-pearl-ribbons.webp`, proposition 1 déjà validée. Source
runtime : scène Unicorn Studio `Summariz / Pearl Ribbons v1.0.0 LIVE`, projet publié
`DOqliqCw4h0BKDqgFIEK`, SDK 2.6.0.

### Unicorn creation

- L'asset approuvé a été importé dans Unicorn et sert directement de texture : aucune réinterprétation
  générative ni couche UI n'a été ajoutée.
- La scène de production utilise une seule passe à 75 % de résolution. Elle applique un morphing UV
  très léger, une dérive diagonale lente et un parallaxe souris borné, sans particules, rotation,
  couleur saturée, bloom ni effet décoratif supplémentaire.
- Les captures Unicorn à 0, 10, 20 et 30 secondes confirment une évolution continue, lente et
  perceptible. Les vues Desktop 1440 × 900, Tablet 768 × 1024 et Mobile 390 × 844 conservent le
  cadrage plein écran et le caractère blanc/nacré.
- Performance Unicorn : `Very Light`, coût effectif 0,3 avant aplatissement et 0,2 après aplatissement.

### Integration and fallbacks

- Le composant React officiel `unicornstudio@2.6.0` charge le projet publié en plein écran à
  `scale={0.75}` et 30 fps. Le canvas et tous ses descendants restent non interactifs.
- Le WebP local est présent dès le premier rendu, puis disparaît uniquement après `onLoad`. Il reste
  visible après `onError`, ce qui couvre les échecs réseau, SDK et WebGL.
- Le runtime se met en pause lorsque le document est masqué. `prefers-reduced-motion` empêche son
  montage, conserve le fallback statique et réagit aussi à une modification de préférence en direct.
- Les seuils de publication personnalisés 1121/761 ont déclenché deux fois l'erreur Unicorn
  `D.getPublishBreakpoints is not a function`. La publication finale utilise donc les breakpoints par
  défaut ; le shader garde un cadrage `cover` calculé à partir de chaque résolution réelle.
- Unicorn a confirmé `published: true` et `flatten: true`, mais a renvoyé `production: false` malgré
  la demande initiale. L'intégration utilise donc explicitement le mode non-CDN cohérent ; activer le
  cache CDN de production nécessitera une republication quand cette option sera disponible.

### Verification

- Production build: passed. Vite émet le SDK Unicorn dans un chunk séparé et conserve l'asset WebP
  hashé pour le fallback.
- Tests ciblés du fond : 4 passed, 2 viewport-specific skips. Ils couvrent desktop/tablette/mobile,
  l'identifiant de projet publié, le fallback décodé, l'absence d'interception pointeur et le
  démontage dynamique en mouvement réduit.
- Full responsive UI suite: 50 passed, 43 intentional viewport/environment skips. Le runtime publié
  a atteint l'état `ready` dans Chromium pendant la validation ; les tests restent compatibles avec
  le fallback afin de préserver le fonctionnement hors ligne.
- Sites packaging: 4 passed. Production build: passed avec `dist/client/index.html`,
  `dist/server/index.js` et `dist/.openai/hosting.json`.
- Revue visuelle locale interactive : le navigateur contrôlable de l'application n'était pas
  disponible dans cette session. Les captures Unicorn natives couvrent la scène seule ; une revue
  humaine de l'embed derrière l'interface complète reste recommandée sur le localhost 4177.

## 2026-11-14 — Fond ambiant nacré, proposition 1

Source visual truth: `src/assets/summariz-pearl-ribbons.webp`, conversion WebP sans perte de la
première proposition ImageGen explicitement choisie par l'utilisateur. Dimensions de la source :
1487 × 1058 px.

### Implementation

- Deux copies fixes et non interactives de la source couvrent le viewport derrière l'application.
  Le plan principal conserve la composition et le second, reflété et très atténué, ajoute une dérive
  presque imperceptible.
- Les cycles initiaux de 52 et 68 secondes paraissaient fixes lors de la revue utilisateur. Ils
  passent à 26 et 34 secondes avec une dérive plus ample mais contenue, complétée par un parallaxe
  souris borné à 9 px horizontalement et 6 px verticalement. Le fond reste blanc et discret.
- `prefers-reduced-motion` supprime les animations, conserve le plan principal statique et masque le
  plan secondaire.

### Verification and blocker

- Production build: passed. The selected WebP is emitted as a hashed build asset.
- Automated desktop, tablet and mobile checks confirm full-screen fixed positioning, disabled pointer
  events, decoded image dimensions, the 26-second primary animation and live pointer parallax. The
  reduced-motion desktop check confirms the static fallback. Four targeted checks passed; two
  viewport-specific cases were skipped as intended. The complete responsive suite reports 50 passed
  and 43 intentional project/viewport skips.
- Intended comparison viewport: 1440 × 1024, Review default state. No implementation screenshot or
  pixel-density comparison could be captured because browser discovery returned no controllable
  browser. Full-view and focused rendered comparisons therefore remain unavailable.

Final result: blocked.

## 2026-11-14 — Icônes Note & IA

Source visual truth: latest user-provided Note & IA screenshot and explicit request to improve the
icons without changing the panel structure.

### Implementation

- Generic magic-wand marks are replaced by the installed `SiGooglegemini` brand icon in the
  selection hint, empty conversation, assistant header and Gemini action.
- Autosave uses `CheckCircledIcon`; the transient saving state uses the existing rotating
  `ReloadIcon`. Conversation uses a restrained `ChatBubbleIcon`.
- Icon sizes, alignment, flex behavior, contrast and optical shadows are normalized. The empty-state
  Gemini mark gets one compact glass container while the primary button keeps a direct white mark.

### Verification and blocker

- Responsive Note/AI and Gemini flows pass their automated desktop, tablet and mobile checks.
- The in-app browser and Chrome are unavailable in this session, so a rendered screenshot comparison
  against the supplied reference remains blocked. Final result: blocked for visual QA only.

## 2026-11-14 — Clés API automatiques et identité Gemini

Source visual truth: latest user-provided API-key screenshot and explicit direction to remove the
configured/remove controls, keep Gemini, use its real library icon and clarify GPT/Claude plus the
separate-Google-project quota tip.

### Implementation

- The magic-wand mark is replaced with the `SiGooglegemini` brand icon from the installed React
  Icons library.
- Configure, Remove and Save actions are absent. A valid replacement is saved automatically after a
  short pause or blur; clearing the masked field calls the existing secure deletion route.
- Every field exposes a quiet inline state: add, typing, synchronizing, synchronized or check.
- Copy states that Gemini is the active Web provider. OpenAI (GPT) and Anthropic (Claude) are named
  as compatible future connectors, never as currently working choices.
- The quota tip recommends separate Google AI Studio projects and warns that keys in one project
  generally share quota.
- Secret values remain server-only; the browser receives only `configured` and renders a constant
  local mask.

### Verification and blocker

- Targeted interaction coverage verifies automatic replacement and deletion requests, absence of
  Configure/Remove/Save buttons, server-only secrets and the updated provider copy.
- Full responsive UI suite: 42 passed, 33 environment/viewport-specific cases skipped as intended.
- Secret-boundary suite: 5 passed, including the isolated macOS Keychain lifecycle.
- Production build and all 4 Sites packaging tests passed.
- Neither the in-app browser nor Chrome was available in this session. A browser-rendered comparison
  is still required before visual QA can pass.

## 2026-11-13 — Grille régulière et matériau unifié dans Clés API

Source visual truth: latest user-provided API-key dialog screenshot and explicit feedback that its
mixed card treatments and irregular alignment were visually unacceptable.

### Implementation

- The three provider-key cards now share one 132px minimum geometry, a 48px header row, a 12px gap
  and a 44px input row.
- Title and status share the first grid row; the description spans the full card width underneath,
  removing the former uneven text/status columns.
- Configured, unconfigured and removal states use illuminated green, neutral and red materials with
  identical 28px control height.
- The Google free-key callout, provider mark, inputs and both security/advice cards now reuse the
  same light hotspot, lower edge and short shadow as the rest of the interface.
- Copy, security behavior, password inputs and key-storage boundaries are unchanged.

### Verification and blocker

- The targeted desktop check passes and asserts three equal-height cards, three 44px inputs, radial
  and linear light layers plus visible shadows on the Google callout and key cards.
- Full responsive UI suite: 41 passed, 31 environment/viewport-specific cases skipped as intended.
- Production build: passed; playlist sync retained 33 summaries and 33 genuine thumbnails.
- Sites packaging tests: 4 passed.
- The in-app browser remains unavailable, so a rendered comparison against the user screenshot
  cannot be captured and visual QA remains blocked pending inspection in the running local preview.

## 2026-11-13 — Éclairage partagé par toutes les cartes

Source visual truth: latest user-provided Review screenshot and explicit direction to apply the
active-navigation light treatment to the remaining card surfaces.

### Implementation

- A dedicated card material uses the same off-center white hotspot and cool translucent base as the
  controls, with a wider diffusion and broader depth so cards do not look like oversized buttons.
- The material covers the Review card/deck, context cards, Home and History containers,
  completion/export cards, receipts, dialogs, API fields, Note & IA and assistant/AI responses.
- Card hover is limited to interactive export cards; static reading surfaces do not move.
- The genuine YouTube thumbnail remains unfiltered, unzoomed and visually separate from the glass
  material applied to the card body.

### Verification and blocker

Two targeted desktop checks pass. They assert radial and linear light layers, card-level shadows and
the expected backdrop blur on Review, context, Home, History and API-card surfaces. The complete
responsive run reports 41 passed and 31 intentional project/viewport skips; the production build and
four Sites packaging checks also pass. The in-app browser remains unavailable, so a rendered
comparison against the user screenshot cannot be captured and visual QA remains blocked pending
inspection in the running local preview.

## 2026-11-13 — Éclairage du bouton Review propagé aux contrôles

Source visual truth: user-provided crop of the active `Review` navigation button, showing a pale-blue
glass fill, restrained 6px radius, blue icon/text, bright upper light and short soft shadow.

### Implementation

- The selected-navigation material is now a shared token used by desktop navigation, mobile
  navigation and selected detail tabs.
- Neutral, blue and red button materials reuse the same off-center radial light over a vertical
  translucent gradient, with a denser lower edge and short shadow.
- Hover states move the light slightly, raise the control by one pixel and deepen the shadow without
  changing geometry or semantic color.
- The same construction now reaches API-key removal, History removal, excerpt close and mobile Note
  controls; thumbnail rendering and swipe feedback are unchanged.

### Verification and blocker

Five targeted checks pass across desktop, tablet and mobile, with four intentional scope skips. They
assert both radial and linear light layers, visible shadows, shared geometry and secondary-screen
coverage. The complete responsive run reports 41 passed and 31 intentional project/viewport skips;
the production build and four Sites packaging checks also pass. The in-app browser remains
unavailable, so a rendered same-state comparison against the user crop cannot be captured and visual
QA remains blocked pending inspection in the local preview.

## 2026-11-13 — Rayons resserrés et langage glass partagé

Source visual truth: latest explicit user direction to reduce button rounding and propagate the same
design treatment to the rest of the interface without changing information architecture or behavior.

### Implementation

- Decision controls moved from a full capsule to a 10px rounded rectangle.
- The global geometry scale is now 12px windows, 10px cards/actions, 8px panels, 6px controls and 5px
  nested controls. Pills remain limited to progress and status semantics.
- Neutral, blue-tinted and red-tinted glass tokens now cover active navigation, progress containers,
  context panels, forms, history/completion surfaces, dialogs, tabs, Note & IA and actions.
- Typography, layout, copy, genuine thumbnail behavior and swipe gradients are unchanged.

### Verification and blocker

Two targeted desktop checks pass: Review/context alignment plus shared glass geometry across Home and
the API-key dialog. They assert the 10px decision radius, 12px dialog/form radius, 10px context-card
radius, material gradients, backdrop blur and shadows. The complete responsive run reports 41 passed
and 31 intentional project/viewport skips. The in-app browser remains unavailable, so a new rendered
comparison cannot be captured; visual QA remains blocked pending inspection in the running local
preview.

## 2026-11-13 — Gradient noir directionnel du swipe

Source visual truth: latest explicit user direction to replace the largely uniform semantic tint
with a darker black-to-color gradient while preserving the direct-on-card layer.

### Implementation

- Right exit: black trailing edge progressing to saturated green at the right edge.
- Left exit: saturated red at the left edge progressing to black on the trailing right edge.
- The same layer is shared by the Review card and the open reading sheet; rest state and genuine
  thumbnail rendering remain unchanged.
- Automated direction test passed for both gradients, their opacity and the absence of a colored
  panel behind the card.

### QA blocker

The in-app browser runtime reported no available browser, so a current rendered screenshot could not
be captured and compared with the preceding implementation evidence. The CSS and interaction test
are verified, but this visual-only refinement still requires human inspection in the running local
preview before Product Design QA can mark the new state as passed.

## 2026-11-13 — iOS 27 Liquid Glass, teinte de swipe directe et miniatures sans zoom

Source visual truth: latest explicit user direction, supported by the supplied iOS 26/27 comparison
and checked against Apple's current official Human Interface Guidelines for Buttons and Materials,
plus the WWDC Liquid Glass guidance. The web treatment is a CSS approximation of the Apple material,
not a claim of native system refraction.

Implementation evidence:

- `../../docs/audits/summariz-premium-ui/ios27-liquid-controls/before-rest.png` and
  `after-rest.png`, controlled 1333 × 635 rest-state captures;
- `../../docs/audits/summariz-premium-ui/ios27-liquid-controls/compare-rest.png`, same-state controls
  comparison with the previous version on the left and revised version on the right;
- `../../docs/audits/summariz-premium-ui/ios27-liquid-controls/compare-swipe.png`, same-progress swipe
  comparison showing the removed underlay on the left and direct card tint on the right.

### Findings and fixes

- [P2, fixed] Decision controls were too flat. Keep, Discard and Undo now use translucent capsules,
  brighter upper specular light, a denser lower edge, backdrop blur, restrained depth and a short
  lift/press response. The material remains neutral so semantic color is reserved for the gesture.
- [P1, fixed] Swipe feedback appeared as a red or green panel behind the rotating card. Both panels
  were removed. A direction-aware layer now tints the complete card or reading sheet itself and
  follows swipe distance before the ease-in-out exit.
- [P2, fixed] A 1.36× transform magnified 4:3 `hqdefault` assets and exposed compression. The forced
  zoom and ratio branch were removed. Dynamic playlist cards request `maxresdefault` first and fall
  back to `hqdefault` only when the higher-resolution source fails.

### Required fidelity surfaces

- Typography, copy and information hierarchy: unchanged.
- Spacing/layout: card, context grid and responsive structure remain aligned.
- Colors/tokens: neutral glass at rest; semantic red/green exists only as a moving card layer.
- Image quality: no extra CSS magnification; authentic YouTube assets remain centered.
- Interaction: pointer, button and keyboard decisions keep identical outcomes and Undo behavior.

The comparisons show the affected rest and swipe states at the same viewport. Automated checks cover
both directions, the open sheet, the absence of underlays, glass tokens and the no-zoom fallback.
Complete Playwright result: 40 passed, 29 intentionally skipped by project/environment scope. No
actionable P0, P1 or P2 finding remains after this pass.

## 2026-11-13 — Surface de swipe étendue à toute la fiche

Source interaction truth: latest explicit user direction that the open reading card must accept a
left/right swipe wherever the pointer starts, whether the surface contains text or a control.

### Finding and fix

- [P1, fixed] The previous guard created dead zones over summary text, tabs, links, buttons and the
  Note & IA panel. Pointer tracking now begins from every descendant of the reading sheet. A simple
  click or normal typing is unchanged; after a horizontal lock, incidental selection is cleared and
  the nested click is suppressed so only the swipe decision fires. Vertical movement still wins and
  leaves the sheet open.

### Verification

- A real pointer path starting on rendered summary text keeps the card and advances.
- A real pointer path starting inside the Note textarea keeps the card and advances.
- A vertical drag over the same summary text does not decide.
- Note entry, autosave, tabs, Gemini selection flow, keyboard decisions and the original header swipe
  still pass.
- Complete Playwright result: 40 passed, 29 intentionally skipped by project/environment scope.

No resting visual surface changed, so a new static comparison would not expose this interaction fix.
The existing rotation/ease-in-out screenshots remain authoritative for motion appearance; pointer
tests provide the relevant evidence for hit-area coverage. No actionable P0, P1 or P2 finding remains.

## 2026-11-13 — Recadrage des miniatures YouTube 4:3

Historical record: this crop was implemented and verified at the time, but is superseded by the
newer no-zoom quality decision above. The 1.36× transform is no longer present in production code.

Source visual truth: user-provided inline crop showing a genuine YouTube thumbnail with black bars
embedded above and below its 16:9 artwork. The visible source crop is 473 × 431 pixels.

Implementation evidence:

- `../../docs/audits/summariz-premium-ui/thumbnail-crop/before.png`, controlled 4:3 reproduction at
  1333 × 635 pixels, CSS viewport 1333 × 635, device scale factor 1;
- `../../docs/audits/summariz-premium-ui/thumbnail-crop/after.png`, revised implementation at the same
  viewport and state;
- `../../docs/audits/summariz-premium-ui/thumbnail-crop/compare-before-after.png`, same-state full-view
  comparison with the uncropped state on the left and the centered crop on the right.

### Finding and fix

- [P2, fixed] `object-fit: cover` could not remove bars already baked into a 4:3 YouTube image when
  the desktop media slot was close to square. The image now detects a natural 4:3 ratio and applies
  an immediate centered 1.36× crop on desktop. The 16:9 content fills the slot without distortion;
  genuine 16:9 thumbnails and the mobile crop remain unchanged.

### Required fidelity surfaces

- Typography and copy: unchanged.
- Spacing and layout: card geometry, grid and actions are unchanged.
- Colors and tokens: unchanged; the black bars disappear because the source is cropped, not painted.
- Image quality: source pixels are preserved, centered and enlarged without stretching.
- Interaction: opening, dragging and keyboard decisions are unchanged.

The focused source crop and controlled full-card comparison are sufficient because this change only
affects embedded letterboxing. The complete Playwright run now reports 40 passed and 29 intentional
skips; the dedicated crop and responsive-thumbnail checks both pass. No actionable P0, P1 or P2
finding remains.

## 2026-11-13 — Liquid controls, uniform context grid and unified swipe motion

Source visual truth: user-provided inline Review screenshot, normalized through the same-state local
capture `../../docs/audits/summariz-premium-ui/liquid-grid/before.png` at 1333 × 635 pixels,
CSS viewport 1333 × 635, device scale factor 1.

Implementation evidence:

- `../../docs/audits/summariz-premium-ui/liquid-grid/after.png`, 1333 × 635 pixels;
- `../../docs/audits/summariz-premium-ui/liquid-grid/after-mobile.png`, 375 × 812 pixels;
- `../../docs/audits/summariz-premium-ui/liquid-grid/compare-before-after.png`, same-state side-by-side
  comparison (before left, after right).

### Findings and fixes

- [P2, fixed] The three-panel context rail extended below the Review actions. `Ensuite` was removed;
  `À retenir` and `Raccourcis` now form two equal rows whose combined height matches the card plus
  decision controls exactly.
- [P2, fixed] Resting decision controls were flat. They now use restrained neutral liquid glass:
  translucent gradient, backdrop blur, internal highlight and low elevation, without colored stroke.
- [P2, fixed] Context headings lacked a coherent icon treatment. Existing Radix `BookmarkIcon` and
  `LightningBoltIcon` now use the same compact neutral glass container; no dependency was added.
- [P1, fixed] Arrow keys were inactive in the open sheet and its exit lacked the Review card's
  rotation. ArrowLeft/ArrowRight now trigger the guarded decision flow with translation, ±7° rotation
  and the same ease-in-out acceleration family as pointer swipes.

### Required fidelity surfaces

- Typography: unchanged Geist hierarchy and wrapping; no regression visible in the comparison.
- Spacing/layout: context rail and Review column align at 472px; the two context rows are equal.
- Colors/tokens: neutral glass at rest, temporary semantic red/green only after a decision.
- Image quality: genuine thumbnail behavior and centered crop are unchanged.
- Copy/content: `Ensuite` is intentionally removed; `À retenir` and shortcut labels are unchanged.

Focused regions were not split into separate files because the full 1333 × 635 comparison keeps the
buttons, context rail, icons and vertical alignment readable at original resolution. Automated checks
also assert the two equal panel heights, rail/Review alignment, glass properties and keyboard rotation.

No actionable P0, P1 or P2 finding remains. Physical Safari/iOS touch remains a release check.
Current Playwright result: 39 passed, 27 intentionally skipped by project/environment scope.

## 2026-11-13 — Editorial card follow-up

The user's latest review supersedes the initial 16:9 media slot and always-colored decision buttons:

- the authentic thumbnail again occupies the full media region, with a centered `cover` crop on
  desktop and mobile;
- clicking any non-control area of the card opens the full sheet; dragging still decides without
  opening it;
- Keep and Discard are neutral at rest and have no colored stroke. Activation briefly fills the
  selected button green or red, then returns it to neutral;
- decorative action keycaps and the keyboard pictogram were removed while ArrowLeft, ArrowRight and
  Command/Ctrl+Z remain active;
- colored panel-edge accents were removed; structural borders use the neutral system line.

Current browser evidence:

- `../../docs/audits/summariz-premium-ui/after-feedback/review-1440.png`;
- `../../docs/audits/summariz-premium-ui/after-feedback/review-375.png`.

The responsive acceptance test verifies full-height/full-width media geometry, card-body opening,
green/red activation frames, drag suppression and horizontal overflow at all target widths.

### Keyboard and open-sheet decision follow-up

- Enter opens the active Review card on desktop, tablet and mobile layouts.
- A deliberate horizontal gesture in the open sheet keeps or discards, closes the sheet and advances;
  the real pointer path is covered on desktop and the mobile layout.
- The first pass excluded Note & IA, form fields, tabs, buttons, links and selectable text. The latest
  validated interaction supersedes that restriction: the gesture can start anywhere in the sheet.
  Simple clicks and typing remain active; vertical movement keeps scrolling, while a deliberate
  horizontal lock clears incidental selection and suppresses the nested click.
- Buttons, Review arrows and Undo remain complete alternatives.
- Current Playwright result after this interaction pass: 37 passed, 23 intentionally skipped by
  project/environment scope.

## 2026-11-13 — Initial premium Review and conversational AI

The premium pass keeps the approved Fluid Knowledge structure while correcting the highest-impact
Review and detail issues found in a fresh browser audit:

- genuine thumbnails initially used a measured 16:9 frame; the editorial follow-up above supersedes
  that media treatment;
- the Review card is shorter and more balanced on desktop, while title, excerpt and action remain
  visible on 320px and 375px mobile widths;
- Discard and Keep initially used persistent semantic red and green; the follow-up above limits
  color to temporary decision feedback;
- Undo remains in the decision row on mobile. `À retenir`, `Raccourcis` and `Ensuite` were initially
  restored at small widths; the latest grid pass intentionally removes `Ensuite` everywhere;
- Geist Sans and Geist Mono are bundled locally, with the Apple system stack as fallback;
- Note & IA is now a persistent multi-turn Gemini conversation. Follow-ups send bounded recent
  history to the server, while copy, add-to-Note, retry and ChatGPT continuation remain available.

### Browser evidence

- Full audit: `../../docs/audits/summariz-premium-ui/AUDIT.md`.
- Before captures: `../../docs/audits/summariz-premium-ui/before/`.
- After captures: `../../docs/audits/summariz-premium-ui/after/`.
- Side-by-side comparisons: `../../docs/audits/summariz-premium-ui/compare-review-1440.png` and
  `../../docs/audits/summariz-premium-ui/compare-review-375.png`.
- Audited widths: 320, 375, 768, 1024 and 1440 CSS pixels in Chromium.

No P0, P1 or P2 issue remains in the audited Chromium Review and conversation surfaces. Physical
iPhone/iPad touch interruption, Safari rendering and screen-reader traversal remain release checks;
browser screenshots do not establish full WCAG or hardware compatibility.

### Verification for this pass

- Responsive Playwright suite: 31 passed, 20 intentionally skipped by project/environment scope.
- Real pointer drag: Keep, Discard, Undo and no accidental thumbnail opening passed.
- Two-turn Gemini mock: prior history reached the server, persisted per video and remained reusable
  by Note and ChatGPT continuation.
- Production build, Sites packaging (4 tests) and secret boundary suite (5 tests): passed.
- Python deep-dive entrypoint: Black check, Ruff and Python 3.11 byte-compilation passed.
- No horizontal overflow at the five target widths; media fill geometry checked programmatically.

Result for the 2026-11-13 Chromium acceptance scope: **passed**.

## 2026-11-08 — Apple × Unslop refinement

Direction approved by the user: preserve Fluid Knowledge and its Apple character while applying the
light-slop polish method from [Unslop by Damir Sokolovsky](https://github.com/heydamir/unslop)
(CC BY 4.0).

- Product: review long YouTube knowledge cards quickly without losing the full source, notes or AI
  follow-up.
- Character: calm, exact, quietly editorial.
- World: paper notes beside a video screen.
- Moment: the genuine YouTube thumbnail carries the visual richness; the surrounding chrome stays
  neutral.
- Signature: the left/right review decision and its matching keyboard keycap.

Implemented passes: 4px-based navigation rhythm; ink-neutral light ramp; blue limited to active
navigation and primary actions; semantic green/red; system/SF-first typography with 500–600 weights;
sentence-case meta labels; reduced shadows; 6–16px nested radii; flatter contextual panels; removal
of loud marketing-style badge treatments; and `YouTube · synthèse` in place of technical local-copy.
The existing icon family, section order, responsive layout, real thumbnails and swipe behavior were
preserved.

The in-app browser was unavailable during this pass. Build, Sites packaging and secret-boundary
tests pass, but no new same-state screenshot was accepted. Visual comparison for this refinement is
therefore still blocked and must not be inferred from the build alone.

- Source visual truth: `/Users/insular/transcripts/docs/assets/web-v1-fluid-knowledge-review-mobile.png`
- Implementation: `/Users/insular/transcripts/prototypes/fluid-knowledge-web/`
- Local preview: `http://127.0.0.1:4175/`
- Dataset: local playlist 32, 33 current long Markdown summaries from `output/videos/playlist-32/`
- Assets: 33 genuine YouTube thumbnails; no generated or approximated fallback
- States: responsive Review card, complete long-summary sheet, persistent Note and contextual AI

## Captured evidence

- Desktop Review: `qa/playlist-32/desktop-review.png`, `1440 x 1024` pixels, CSS viewport `1440 x 1024`, device scale factor `1`.
- Desktop long summary: `qa/playlist-32/desktop-long-summary.png`, `1440 x 1024` pixels, CSS viewport `1440 x 1024`, device scale factor `1`.
- Mobile Review: `qa/playlist-32/mobile-review.png`, `786 x 1704` pixels, CSS viewport `393 x 852`, device scale factor `2`.
- Mobile long summary: `qa/playlist-32/mobile-long-summary.png`, `786 x 1704` pixels, CSS viewport `393 x 852`, device scale factor `2`.
- Normalized source: `qa/source-fluid-knowledge-mobile-normalized.png`, resized from `852 x 1846` to `786 x 1704` with Lanczos scaling.
- Source comparison: `qa/playlist-32/compare-source-vs-mobile-review.png`.

The Review and long-summary captures above remain the accepted evidence for the selected visual
direction. The completion, export, active-History, Note, contextual-AI, Clés API and 2026-11-08
long-playlist batch extensions have automated responsive coverage but no accepted browser capture:
the Codex in-app Browser reported that no browser surface was available. Their visual comparison is
therefore blocked rather than inferred from build output.

The normalized source and implementation were reviewed side by side. The final UI preserves the selected hierarchy—identity, Review context, progress, dominant card, Keep/Discard decisions, Undo and bottom navigation—while using the real playlist 32 content.

The 2026-11-08 radius pass replaces the oversized 24–28px rounding on desktop cards and dialogs
with a restrained scale: 18px outer windows, 12–16px nested panels and 8–10px controls. Circles and
true status pills remain unchanged. Build and interaction coverage pass, but a new same-state browser
capture is unavailable, so visual fidelity for this pass remains blocked rather than inferred.

## Findings

No actionable P0, P1 or P2 issue remains on the previously captured Review and detail surfaces.
Visual P0/P1/P2 assessment of completion, History, Note/AI, Clés API and quota recovery remains
blocked until a browser capture can be opened and compared.

- [P3] The prototype bundles the 33 long summaries and Markdown renderer in the main JavaScript chunk. Production should lazy-load each full summary when its sheet opens.
- [P3] Duration and channel metadata are absent from the current Markdown source, so the UI intentionally omits them instead of inventing values.
- [P3, historical] The blurred extension and later inset 16:9 slot are both superseded. The current
  media region uses the authentic thumbnail as a centered full-bleed crop.

## Required fidelity surfaces

- Typography: compact Apple-like hierarchy with responsive system/Inter typography; long titles wrap on desktop and clamp safely on mobile.
- Layout rhythm: desktop uses a navigation rail, central review card and context panel; mobile keeps the card, decisions, Undo and bottom navigation visible in the first viewport.
- Visual tokens: off-white canvas, elevated white cards, blue navigation and neutral decision
  buttons match the selected Fluid Knowledge direction; green/red appear only during confirmation.
- Asset fidelity: all 33 entries use their genuine YouTube thumbnail. A neutral “Miniature indisponible” state is used if a genuine asset later fails; no synthetic thumbnail is generated.
- Content fidelity: the card excerpt and “À retenir” points are extracted from each current Markdown summary. “Ouvrir la fiche” renders the complete Markdown and names the exact local source file.
- Responsive behavior: no horizontal overflow at desktop, tablet or mobile test widths. The
  long-summary sheet is scrollable, keeps the Note beside the reading column on desktop/tablet and
  exposes Note & IA as a bottom sheet on mobile.

## Focused interaction evidence

- Swipe/drag supports right to keep and left to discard, with explicit buttons as accessible alternatives.
- Keyboard arrows trigger the same decisions; Command/Ctrl+Z restores the latest decision.
- The Review flow advances to the next real playlist entry and updates progress from 1/33.
- The long-summary sheet exposes the complete structured summary, a persistent per-video Note and
  an honest transcript placeholder linked to the exact YouTube source.
- Selecting summary text feeds a bounded Gemini request; the simulated response can be copied or
  explicitly added to the Note. The ChatGPT fallback copies its context before opening the official
  site.
- Clés API is reachable from desktop, tablet and mobile chrome; it exposes two password fields,
  Google free-key guidance and a quota-recovery route without echoing secrets.

## Verification

- Responsive interaction suite: 26 tests passed and 16 environment-specific cases skipped. ZIP,
  PDF, Maxi Brain, contextual Gemini, Keychain-backed key status, quota recovery and foreign-origin
  rejection are exercised on desktop; navigation, Review, Clés API, persistent Note, detail,
  active History and creation of a new playlist job are exercised across the configured viewports.
- Secret-storage suite: 5 tests passed, including a real isolated macOS Keychain save/read/remove
  cycle, a legacy `.env` migration and a clean child-process environment boundary. Fake test keys
  are removed after each run. Two request-guard tests cover loopback-only access and mandatory
  same-origin mutations.
- Sites packaging suite: 4 tests passed.
- Production build: passed.
- Restrained-radius regression run: production build passed; 26 responsive interaction tests passed
  and 16 environment-specific cases skipped.
- Console and page errors during captures: none.
- Horizontal overflow: none at `1440`, `900` or `393` CSS pixels.
- Thumbnail sync: 33 summaries and 33 genuine YouTube thumbnails.

final result: blocked
