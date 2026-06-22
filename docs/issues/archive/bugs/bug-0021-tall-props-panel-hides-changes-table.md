---
id: BUG-0021
title: Tall properties panel (with its own scrollbar) hides the changes table
priority: medium
status: done
---

## Statement

On the BPMN differ page, when the properties panel holds many entries and all
groups are expanded, the panel becomes taller than the viewport and grows its
own vertical scrollbar. In that state, clicking **Show changes** does nothing
visible: the changes table is rendered but pushed below the fold, off-screen,
because the over-tall properties panel has already grown the layout past the
viewport height. The table is unreachable (the page does not scroll).

## Context

Layout: `BpmnDifferView.build()` builds a 3-row outer `<table>` of height `100%`
inside a `position:fixed`, `height:100vh` container:

- row1 — header/toolbar
- row2 — `height:100%`, holds the canvas + splitter + properties cells
- row3 — footer with the Changes summary and the changes table

Affected files / lines:

- `src/differ/bpmn/bpmn-differ-view.js:150-155` — `#propsCell` is a `<td>` with
  `height:100%`. The bpmn-js properties panel is attached directly into it
  (`bpmn-differ.js:304-305`, `parent: '#' + PROPS_ID`).
- `src/differ/bpmn/bpmn-differ-view.js:444-528` — `#createFooter()` builds the
  changes table inside row3; the **Show changes** button toggles
  `changesTableDiv.style.display` between `none`/`block` (lines 509-527).

Root cause: a `<td>`'s `height` is a *minimum*, not a clamp — a table cell
expands to fit its content. When the properties-panel content is taller than the
space row2 was allotted, the cell (and therefore row2 and the whole outer table)
grows past `100vh`. row3 is laid out after row2, so the footer — and the changes
table inside it — ends up below the visible area. The container is
`overflow:visible` with no page scroll, so it cannot be reached.

This is BPMN-specific: only the BPMN differ mounts a bpmn-js properties panel.
The DMN differ has no equivalent panel, so its layout is unaffected — but the
footer/`ChangesTableView` is shared in spirit, so any layout change should be
sanity-checked there too.

Secondary defect spotted while diagnosing (`bpmn-differ-view.js:487`):
`changesTableDiv.style.maxHeight = 250;` assigns a *Number*, which serializes to
the unitless string `"250"` and is rejected as invalid CSS — so `max-height` is
effectively unset and the changes table is not capped at 250px as intended.
Should be `'250px'`. This makes the changes table grow to its full content
height, worsening the overflow.

### Repro

1. Open a BPMN diff with an element that has many properties.
2. Select that element; expand all property groups so the panel gets a vertical
   scrollbar (panel content taller than the viewport).
3. Click **Show changes** — the changes table does not appear on screen.

### Proposed fix (plan)

Constrain the properties panel to scroll *inside* its cell so it never grows the
table past the viewport, instead of letting the `<td>` expand to content.

1. In `build()`, keep the `<td>` (`#propsCell`) as the layout/column element
   (it still owns `width` / `minWidth` / `display` for the splitter and the
   hide toggle — lines 153-154, 226, 241, 253, 259). Set it
   `position: relative`.
2. Move `id = PROPS_ID` onto a new inner `<div>` placed inside the cell, styled
   `position:absolute; inset:0; overflow-y:auto`. The bpmn-js panel then mounts
   into the inner div (the `parent: '#'+PROPS_ID` selector is unchanged) and
   scrolls within the cell; an absolutely-positioned child contributes zero
   intrinsic height, so the cell/row/table no longer grow past `100vh` and row3
   stays on screen. Chrome-only target, so `position:relative` on `<td>` is
   safe.
3. Verify the consumers of `PROPS_ID` still work: the `beforeinput` veto
   delegation (`bpmn-differ.js:152-154`) and `PropertiesPanelHighlighter`
   (document-/group-relative `querySelector`s, no dependency on the td being the
   direct parent).
4. Fix the secondary defect: `changesTableDiv.style.maxHeight = '250px'`
   (`bpmn-differ-view.js:487`).

### Risks / checks

- ⚠️ View-only invariant (BUG-0011 → 0014 → 0015): after the change, confirm the
  properties-panel fields stay selectable and Ctrl/Cmd+C copy still works.
- Confirm the splitter resize, props-panel hide/show, and width persistence are
  unaffected (width/display still on the `<td>`).
- Confirm `viewport.fit()` still frames the canvas correctly after toggling the
  changes table with a tall panel.

## Work log

<!-- Each AI session on the task — a separate entry. Freshest first. -->

### 2026-06-22 · claude-opus-4-8 · branch `fix/bug-0021-tall-props-panel`

Implemented the proposed fix in `src/differ/bpmn/bpmn-differ-view.js`:

- `#propsCell` (`<td>`) is now the layout/column element only — kept its
  `height`/`minWidth`/`width`/`display` for the splitter, width persistence and
  hide toggle. Added `position: relative`; removed its `id`.
- Moved `id = PROPS_ID` onto a new inner `<div>` inside the cell, styled
  `position:absolute; inset:0; overflow-y:auto`. The bpmn-js panel mounts into it
  (`parent: '#'+PROPS_ID` unchanged) and scrolls within the cell; the absolute
  child contributes zero intrinsic height, so the cell/row/outer table no longer
  grow past `100vh` and the footer (changes table) stays on screen.
- Fixed the secondary defect: `changesTableDiv.style.maxHeight = '250px'` (was a
  bare Number `250` → invalid CSS, ignored).

Consumers of `PROPS_ID` unaffected: the `beforeinput` veto delegation
(`bpmn-differ.js:152`) and the panel `parent` selector (`bpmn-differ.js:305`)
both resolve to the inner div, which still contains `.bio-properties-panel`. The
view-only invariant (BUG-0011→0015) is preserved — the veto still sits on the
container that holds the panel, so field selection and Ctrl/Cmd+C copy keep
working. `npm test` green (997 passed).
