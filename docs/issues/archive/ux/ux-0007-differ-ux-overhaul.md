---
id: UX-0007
title: Differ-page UX improvements — resizable properties panel, compact toolbar, styling
priority: medium
status: done
---

## Statement

Improve the differ-page UX in four directions:

- **A. Resizable properties panel (BPMN).** Currently the properties panel is a `<td>` with rigid
  `minWidth: 300px / maxWidth: 600px` (`bpmn-differ-view.js`), it cannot be widened;
  long values (expressions, mappings, class FQNs) do not fit. Only a binary
  "hide/show" is available. We need a draggable splitter between the canvas and the
  panel, removing `maxWidth`, and remembering the width between openings.
- **B. Compact toolbar.** 9 text buttons of 90–130px are scattered across two rows
  of the header and the footer. Zoom (`Zoom In/Out/Fit`) takes ~270px in text → convert it to
  icons. Group the buttons by meaning. Separate the destructive `Close`.
- **C. Visual styling.** A flat white background with no header/dividers/padding;
  layout on nested `<table>`s with inline styles. Introduce a light header bar and a unified
  button style via classes in `styles.css`.
- **D. The same visual language for DMN.** Apply the header/grouping/icon zoom
  to `dmn-differ-view.js` (there is no properties panel or splitter there — item A does not apply).

## Context

Affected files:
- `src/differ/bpmn/bpmn-differ-view.js` — layout/header/footer of the BPMN differ, the properties panel (`PROPS_ID`, `propsCell`, `minWidth/maxWidth` on lines ~85-90), all buttons.
- `src/differ/dmn/dmn-differ-view.js` — layout/header of the DMN differ (no properties panel and footer, there is a `Show full`).
- `src/differ/styles.css` — the only CSS of the differ page; shared by both views.
- `src/differ/bpmn/canvas-viewport.js` — `fit()` to redraw the canvas after a resize/hiding the panel.

Constraints and risks:
- `BpmnDifferView` and `DmnDifferView` are **separate files, not a shared class**; only
  `styles.css` is shared. The visual language is applied via CSS classes, markup edits —
  in both files.
- The global `table/th/td` and `.changes-table` rules in `styles.css` are **not to be touched** —
  they affect the changes table and the internals of bpmn-js/dmn-js. Everything new — only
  through your own classes (`.differ-toolbar`, `.differ-btn`, `.differ-splitter`, …).
- Do not rewrite the `<table>` layout entirely (a risk of regressions with `viewport.fit()`),
  limit it to pointwise edits. Do not change the zoom/fit/diff/search logic.

Implementation plan (order A→B→C→D):

- **A.** Insert a narrow `<td>` splitter (4–6px, `cursor: col-resize`, class
  `.differ-splitter`, hover highlight) between `canvasCell` and `propsCell`. Remove
  `maxWidth`, set `minWidth: 250px` and a ceiling relative to the window (≤80vw). Drag:
  `mousedown` on the splitter → `mousemove` on `document` → `propsCell.style.width`;
  `mouseup` → remove the listeners. Clamp the width with a pure function
  `clampPanelWidth(desired, min, max)` (cover with a unit test). On drag-end — save it
  to `localStorage` (key `bpmnDiffer.propsWidth`), restore it on `build()`; trigger
  `viewport.fit(true)` once. The `Hide properties` button hides/shows the splitter too.
- **B.** Zoom → icons `+`/`−`/`⤢` (unicode glyphs, no new assets) with `title`.
  Grouping: [view] · [version] · [Close]. The callbacks and behavior — unchanged.
- **C.** Classes `.differ-toolbar`, `.differ-btn`, `.differ-icon-btn`,
  `.differ-btn-group`, `.differ-splitter`, `.differ-btn-danger`. Replace the inline styles
  with classes, keeping the GitLab button classes (the native look).
- **D.** Apply the header/grouping/icon zoom to `dmn-differ-view.js`.

Check: `npm test` (green before push); a check in Chrome on a real MR
(BPMN and DMN) — resize, remembering the width, hide/show, zoom icons, Close. When
the markup changes, update `docs/architecture.md`.

For the visual check, the installed **Chrome DevTools MCP** can be used
(local stdio, scope local; see the `mcp-local-only.md` memory — only
local MCP are allowed): open the differ page, take before/after screenshots, move the splitter
and check the toolbar on a narrow window. The MCP tools become available after restarting the
Claude Code session.

## Work log

<!-- Each AI session on the task is a separate entry. New entries — on top. -->

### 2026-06-16 · claude-opus-4-8 · branch `feature/ux-0007-differ-ux-overhaul`

All four directions implemented (A→B→C→D).

- **A.** In `bpmn-differ-view.js`, a `<td>` splitter was added between the canvas and the properties panel
  (`.differ-splitter`, `cursor: col-resize`, hover highlight). `maxWidth` removed, `minWidth`
  raised to 250px, the ceiling — `0.8 * innerWidth`. Drag: `mousedown` on the splitter →
  `mousemove`/`mouseup` on `document` → `propsCell.style.width`. The width is clamped with a pure
  static `BpmnDifferView.clampPanelWidth(desired, min, max)` (unit test), on drag-end
  it is saved to `localStorage[bpmnDiffer.propsWidth]`, restored on `build()`;
  on drag-end and hide/show — `viewport.fit(true)`. "Hide properties" hides both the panel and the splitter.
- **B.** Zoom converted to icons `+`/`−`/`⤢` (unicode, no assets) with `title`. The buttons
  grouped: [file] · [branch] · [view] · [Close]; `Close` separated and marked `.differ-btn-danger`.
- **C.** The header rewritten into a flex toolbar `.differ-toolbar` with groups `.differ-btn-group`
  (a light header bar, dividers between groups). The inline button styles replaced with classes
  `.differ-btn`/`.differ-icon-btn`; the GitLab button classes preserved (the native look). The buttons
  are built by the `#button`/`#group` helpers.
- **D.** The same visual language applied to `dmn-differ-view.js` (toolbar, groups, icon zoom;
  there is no properties panel or splitter there).

The behavior of the zoom/fit/diff/search/highlight/download/switch callbacks was not changed. A deliberate
small edit within A: when showing the properties panel, `display` is reset to `''`
(back to `table-cell`) instead of the former `block`, which broke the table layout.

Files: `src/differ/bpmn/bpmn-differ-view.js`, `src/differ/dmn/dmn-differ-view.js`,
`src/differ/styles.css`, `test/support/scope.js` (+`BpmnDifferView` in the harness),
`test/differ/bpmn/bpmn-differ-view.test.js` (new), `test/structure/source-layout.test.js`
(removed from `UNTESTED_BY_DESIGN`), `docs/architecture.md`. `npm test` — 640/640 green.
The visual check in Chrome on a real MR — up to the user.
