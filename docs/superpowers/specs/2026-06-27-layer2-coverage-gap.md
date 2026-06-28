# Layer-2 e2e coverage-gap analysis (differ)

Date: 2026-06-27
Status: analysis — basis for the next "Layer-2 completion" plan

Companion to `2026-06-25-e2e-testing-design.md` (the three-layer design). That
spec defines the harness; this document is the systematic gap inventory that
feeds the next implementation plan. Phase 1/1b/2 shipped in MR #140.

## Method

Systematic sweep of `src/differ/**` (four slices — navigation / bpmn-view /
dmn / shared) cross-referenced against the actual depth of the 12 `*.spec.js`
files (Phase 1/1b/2) and the `docs/issues/` backlog. Prioritized by
**protection / effort**: what guards the most regression risk at the lowest
cost on the existing harness.

## What is covered now (and how shallow)

| Area | Covered | Depth / what is NOT checked |
|---|---|---|
| Boot/render | BPMN + DMN smoke | — |
| Diff highlight (canvas) | toggle ☼→☀, marker class on **added** | only the class (not color — it comes from `styles.css`), only the **added** direction; no **removed/changed** |
| Switch branch | BPMN | DMN — none |
| Changes table | added row + click→big-marker | no removed/changed rows, no counters "N elements (M rows)", no reset/clear |
| Condition in panel | sequenceFlow, one direction | no direction inversion, no multi-line formatting |
| Search | open Ctrl/F + basic match + counter non-empty | no Enter/next/prev, no "N/Total", no centering, no Esc/close, no no-match |
| Zoom | in/out/fit (basic) | pan, Ctrl+wheel |
| Hide properties | toggle | no persistence (localStorage) across reload, no splitter |
| Empty/absent | both-absent message, absent-side clear | DMN — none |
| View-only copy | BUG-0014/0015 (JS veto) | CSS invariants (no `styles.css` in the harness) |
| Dive-in | only the **appearance** of the Call Activity badge | click→navigate — none |

## Cross-cutting insight: what Layer-2 actually catches

Unit tests for `DmnDiffPainter`, `PropertiesPanelHighlighter`, and
`BpmnXmlComparator` run against **frozen fixtures** (`dmn-table.html`,
`properties-panel.html`) — a static snapshot of the third-party DOM. Layer-2 is
the **only** level that verifies the painter/highlighter selectors still match
the **real** output of bpmn-js / dmn-js / bio-properties-panel. That is the core
marginal value: drift in third-party markup is invisible to unit tests but
caught by Layer-2. So DMN-highlight and property-group highlight carry high
protection even though comparator logic is already unit-tested.

## Harness constraints and enablers

- ⚠️ The harness loads only JS, **not `styles.css`** → unavailable: CSS view-only
  invariants (hidden context-pad, disabled toggles/selects) and highlight-marker
  colors (`stroke` from CSS). **Enabler**: load `styles.css` into
  `differ-harness.html` — unlocks a whole class of checks in one step.
- diff-paint colors for DMN cells and property groups are set **inline**
  (`style.backgroundColor`) → **assertable via computed-style today**, unlike
  canvas markers.
- Click-navigation (dive-in/handler/correlation/back) needs: canned
  `searchCode`/`prChangedFiles`/`rawFileUrl` responses in `FakePlatformClient` +
  `context.waitForEvent('page')` handling. Doable in Layer-2, but costlier.
- Cross-tab (BUG-0017) and dive-out-into-opener (FEAT-0023) rely on
  `BroadcastChannel` + `window.name` across tabs — at the edge of Layer-2;
  may partly belong to Layer-3.

## Gaps by area

### A. DMN — almost the whole surface ⭐ (protection H / effort L)
Largest uncovered chunk: an entire second differ + the shared `DmnDiffPainter`
(BUG-0004 history). Colors are inline → assertable right now.
- **DMN diff highlight, 3 directions**: rule added (green row `.parentElement` of
  `.rule-index`), removed (red), changed (blue cells `[data-element-id]`); header
  name/hit-policy (`#8888ff`); input/output columns added/removed/changed. Needs
  DMN variant fixtures.
- **DMN switch branch** — mirror of BPMN, trivial once a fixture exists.
- **DMN absent/empty states** (BUG-0001/UX-0003) — both-absent message,
  absent-side clear.

### B. BPMN diff depth — removed/changed directions (protection H / effort L)
Currently only **added** is tested. Direction inversion (showing MR vs target
flips the color meaning) is a frequent regression source.
- Marker classes on **removed** and **changed** elements (needs a fixture where
  the MR removes/changes an element).
- BUG-0010 (subprocess not highlighted when a child changed) — regression case.
- Highlight button **disabled** in branch-only mode.

### C. Properties panel + auto-expand (protection H / effort M)
- **Property-group highlight**: changed group header `#8888ff`, list-item
  added/removed/changed (with inversion by the shown side).
- **Auto-expand FEAT-0029** (both axes: changed groups + type-relevant):
  sequenceFlow→Condition, ServiceTask→Implementation, UserTask→Forms, etc.;
  manual collapse survives switch. Fresh, complex feature, assertable via the
  `open` class.
- Condition: **direction inversion** (removed/MR side), multi-line formatting
  (injected div).

### D. Changes table depth (protection M / effort L)
- removed/changed rows; counter text "Changed: N elements (M rows)" /
  "Added/Removed…"; `resetSelection` on switch/re-show; `clear()` on the
  absent side (UX-0003); row ordering by XML document order.

### E. Search depth (protection M / effort L)
- **Navigation**: Enter / Shift+Enter / ◀▶, marker `search-match-current`,
  counter "2/5", viewport centering, wrap at the edges.
- **Esc / ✕** → close + remove markers. **No-match** (empty counter). Index
  rebuild on switch. Parameter scope (BUG-0007).

### F. Toolbar / header / modes (protection M-H / effort L-M)
- **File-path link FEAT-0026**: `<a href>` (via `blobFileUrl`), class
  `differ-file-path-inactive` when no URL, LRM prefix, `title`=full path.
  BUG-0020 (link to an absent version).
- **Download** enabled/disabled + action (BUG-0001 disable when both-absent).
- **Update indicator FEAT-0012**: "🔔 vX" button, click→`window.open(popupUrl)`;
  none when `updateInfo` is empty. Needs a param.
- **Splitter UX-0007** + **hide-properties persist BUG-0018**: width/hidden in
  `localStorage`, survive reload. BUG-0023 (panel empty when shown after
  init-hidden), BUG-0021/UX-0005 (changes-table height).
- **Branch-indicator absent labels**: italic gray + "file deleted"/"file does
  not exist" (UX-0003), role words (FEAT-0026).
- **Modes**: branch-only (switch/highlight disabled, no indicator),
  **local-file** ("Local", switch disabled), **rename BUG-0002**
  (`targetFilePath` ≠ `filePath`).
- **Single-row geometry BUG-0022**: the spec explicitly asked for geometric
  assertions (`boundingBox` equal tops) — none yet.

### G. Navigation — dive-in click (protection H / effort M)
Currently only the badge appearance. Not covered: **click→open new tab** for
Call Activity and for Decision (BPMN→DMN, FEAT-0005); spinner state
(arrow→spinner→arrow, UX-0008); BUG-0005 (tab blocked on first dive-in). Needs
`searchCode` responses in the fake + multi-tab.

### H. Navigation — handler/delegate badges (protection H / effort M)
FEAT-0003/0004/0015. Entirely uncovered. Permanent badges
`handler-link-{added|changed|removed}` (color by direction), neutral
`handler-link` on selection, BUG-0016 (no duplicate on a labeled element),
FEAT-0018 (message end event), click→MR-diff (opener) vs blob (current ref) vs
search-fallback (BUG-0013). Needs `prChangedFiles`+`rawFileUrl`+`searchCode`.

### I. Navigation — correlation FEAT-0027 (protection M-H / effort M-H)
`correlation-link` badge (✉→) on a message element, search, single→direct jump,
multiple→dropdown, dynamic `${...}`→explanation, BUG-0013 (sub-token). The most
heuristic-heavy code.

### J. Navigation — back / dive-out FEAT-0023 (protection M / effort H)
⤴ button (fast, focus opener), ▾ caret + caller menu (spinner→list→error+search
link), "came-from" mark ↩, fallback link. Auto-select `selectCalledProcessIds`
on dive-out. DMN direction. High effort (opener tab).

### K. Cross-tab (protection M / effort H, possibly Layer-3)
BUG-0017 (no duplicate tab, `BroadcastChannel`+identityKey), FEAT-0025
(re-highlight call-site on reuse). Verify Layer-2 feasibility — otherwise mark
as Layer-3.

### L. Out of scope / low value
- **ProcessFileIndex fallback** — explicitly excluded by the spec (REFAC-0007,
  the "doomed path").
- Pan (drag), Ctrl+wheel zoom, TextAnnotation-fill workaround — low risk / high
  fiddliness.
- Pixel-snapshot, AI-vision — non-goals per the design spec.

## Prioritized roadmap (for the next plan)

Grouped into phases by descending protection/effort — each ≈ one MR:

- **Phase 4a — "DMN parity" (start):** A (DMN highlight ×3, switch, absent) +
  harness enabler "load `styles.css`". Maximum protection per unit of effort: a
  whole uncovered differ, inline colors, harness ready. *New fixtures: DMN base +
  added/removed/changed variants.*
- **Phase 4b — "BPMN diff depth":** B (removed/changed directions, BUG-0010,
  highlight-disabled) + C (property-group highlight + auto-expand FEAT-0029) +
  D (changes-table depth) + condition inversion. *Fixtures: BPMN variant with a
  removal/change.*
- **Phase 4c — "Search & toolbar":** E (search navigation) + F (file-path
  FEAT-0026, download, update FEAT-0012, splitter/hide persist, absent labels,
  branch-only/local/rename modes, BUG-0022 geometry). Harness ready, +1-2 params.
- **Phase 4d — "Navigation click flows":** G (dive-in click) + H (handler badges)
  + I (correlation). Needs canned `searchCode/prChangedFiles/rawFileUrl` in the
  fake + multi-tab. High protection for the most heuristic-heavy code.
- **Phase 4e — "Dive-out & cross-tab":** J + K. First verify Layer-2 feasibility;
  whatever does not fit moves to Layer-3 (Phase 3 of the design spec).
