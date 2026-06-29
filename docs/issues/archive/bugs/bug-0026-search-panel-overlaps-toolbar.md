---
id: BUG-0026
title: Search panel overlaps the toolbar and blocks the "Switch branch" button
priority: low
status: done
---

## Statement

The floating search panel (opened with Ctrl/Cmd+F) is anchored to the top of the
viewport in the same vertical band as the differ toolbar. Because it is centered
and ~440px wide, at common window widths (e.g. the 1280px default) it horizontally
covers the right-pinned "Switch branch" button. While search is open the panel
intercepts pointer events over that area, so a mouse click cannot reach "Switch
branch" (and, depending on width, other toolbar controls). Keyboard navigation and
the search feature itself are unaffected.

## Context

`src/differ/bpmn/search-panel.js` builds the panel and appends it to
`document.body`; `src/differ/styles.css` `.search-panel` positioned it at
`position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 10001`.
The toolbar (`.differ-toolbar`) is the first layout row, full width, with buttons on
the right (Switch branch, zoom/fit/highlight/hide, close), so no horizontal panel
position is safe at every width — the panel has to leave the toolbar's row.

The search panel is intentionally **non-modal** (a find-bar): the product relies on
it staying open and usable across a branch switch (the index is rebuilt and the
search re-runs on switch — `SearchPanel.rebuildIndex`, characterized by
`test/e2e/differ-search-scope-rebuild.spec.js`). So the fix must not block
interaction; it only repositions the panel.

Found while writing the Phase 4c1 search e2e coverage: the rebuild-on-switch test
could not click "Switch branch" with the panel open at the 1280px test viewport and
had to widen the viewport as a workaround.

### Fix

Move the panel just below the toolbar row so it floats over the canvas instead of
the toolbar (`top: 12px` → `top: 52px`; the toolbar is ≈47px tall: `.differ-btn`
`min-height: 34px` + 12px padding + 1px border). CSS-only; the panel stays
non-modal. The matched elements live on the canvas, so the panel sitting over the
canvas top is the natural place for it.

### Affected files

- `src/differ/styles.css` — `.search-panel` top offset
- `test/e2e/differ-search-panel-position.spec.js` — regression test (new): at the
  default 1280px viewport, with search open, the panel does not overlap the toolbar
  and a real click on "Switch branch" lands (the branch indicator flips to the
  target side)

## Work log

<!-- newest first -->

### 2026-06-29 · claude-opus-4-8 · branch `fix/search-panel-overlaps-toolbar`

Found while writing Phase 4c1 search e2e coverage (the rebuild-on-switch test could
not click "Switch branch" with the panel open at 1280px). Repositioned the
non-modal search panel below the toolbar (`top: 12px` → `52px`) so it floats over
the canvas and no longer covers toolbar controls. Regression pinned by the new
`differ-search-panel-position.spec.js` (RED before the fix on the geometric assert,
GREEN after). Full e2e + unit suites green; no JS / shared-class change.
