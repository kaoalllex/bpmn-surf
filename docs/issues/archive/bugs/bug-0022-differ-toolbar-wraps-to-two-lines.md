---
id: BUG-0022
title: Differ toolbar wraps to two lines in a narrow window (esp. after Switch branch to a longer name)
priority: medium
status: done
---

## Statement

In a not-very-wide browser window the differ header bar (file path · branch
indicator · "Switch branch" + view controls + close) does not fit on one line.
Instead of further left-truncating the file path (which already supports `…`
truncation), the whole toolbar **wraps onto a second line**.

It is especially visible on **Switch branch**: when the shown side switches to a
branch whose label is longer, the branch indicator grows, total width crosses the
viewport width, and the toolbar jumps from one row to two.

Expected: the toolbar always stays on a **single line**; when there is not enough
room, the **file path is truncated from the left** (the existing `…` mechanism),
not the layout reflowed to two rows.

## Context

Affected files:

- `src/differ/styles.css` — `.differ-toolbar`, `.differ-btn-group`,
  `.differ-file-group`, `.differ-file-path`, `.differ-toolbar-spacer`
  (lines ~127–199).
- `src/differ/shared/branch-indicator.js` — `createElement()` builds the branch
  `<span>` with `white-space: nowrap` and **no** truncation (lines ~39–48).
- Header assembly (both differs, shared classes — change once, verify both):
  - `src/differ/bpmn/bpmn-differ-view.js` `#createHeader()` (~304–395)
  - `src/differ/dmn/dmn-differ-view.js` `#createHeader()` (~167–248)

### Root cause

1. `.differ-toolbar` has `flex-wrap: wrap` (styles.css:129). When the combined
   content width exceeds the viewport, flexbox prefers **wrapping** over squeezing
   the one shrinkable item, so the bar grows to two rows.
2. The file group is the only intentionally-shrinkable item
   (`.differ-file-group { min-width: 0 }`, and `.differ-file-path` truncates from
   the left via `direction: rtl` + `overflow:hidden` + `text-overflow:ellipsis`).
   That truncation only kicks in when the toolbar is forced to stay on one line —
   which `flex-wrap: wrap` defeats.
3. The branch indicator span grows unbounded (`white-space: nowrap`, no
   `overflow`/`text-overflow`), so switching to a longer branch label adds width
   and tips the bar over the wrap threshold.
4. The inner `.differ-btn-group` groups also have `flex-wrap: wrap`, so button
   groups themselves can break internally too.

## How to fix

Goal: single-row toolbar, with the file path as the sole element that gives up
space (left-truncated). Suggested approach in `src/differ/styles.css`:

1. `.differ-toolbar` → `flex-wrap: nowrap` (and keep `min-width: 0` reachable on
   the shrinkable child). This forces the layout to squeeze instead of wrap.
2. Make every button group rigid so only the file path absorbs the squeeze:
   `.differ-btn-group { flex-wrap: nowrap; flex-shrink: 0; }`. The view-controls /
   switch-branch / close groups must not shrink or wrap.
3. Keep `.differ-file-group { min-width: 0; flex-shrink: 1; }` (it already has
   `min-width: 0`) — it stays the single flexible item, and `.differ-file-path`'s
   existing rtl ellipsis does the left truncation. Verify the LRM prefix
   (FEAT-0026) still keeps slash order readable after the change.
4. **Branch indicator as a secondary fallback** (so an extremely long branch label
   alone cannot re-overflow once the path is already truncated to its base name):
   give the branch group `min-width: 0` and the branch `<span>` `overflow:hidden;
   text-overflow:ellipsis; max-width: …` so it can also truncate, but with **lower
   priority than the file path** (e.g. let the file group shrink first via
   flex-shrink ordering, or only cap the branch span's max-width). Decide whether
   the branch name truncating is acceptable UX — the user's primary ask is to
   truncate the **file path** first.

### Verification

- Narrow the differ window: the bar stays one line; the file path shows `…` on the
  left and keeps the base name; the full path remains in the `title` tooltip.
- Click **Switch branch** to a side with a longer label: still one line, no jump to
  two rows; the file path re-truncates as needed.
- Check **both** BPMN and DMN differs (shared classes) and the absent-side / local
  ("Diff with local") label variants.
- `npm test` green before push.

## Work log

<!-- Each AI session on the task — a separate entry. Newest on top. -->

### 2026-06-22 · claude-opus-4-8 · branch `fix/bug-0022-differ-toolbar-wraps`

Fixed via CSS (`src/differ/styles.css`) plus a class on the branch group in both
differ views:

- `.differ-toolbar` → `flex-wrap: nowrap` — the bar can no longer reflow to two
  rows; it squeezes instead.
- `.differ-btn-group` → `flex-wrap: nowrap; flex-shrink: 0` — control groups stay
  rigid, so the squeeze never lands on the buttons.
- `.differ-file-group` → added `flex-shrink: 99` (kept `min-width: 0`): the file
  path is the primary element that gives up space and collapses to its base name
  (existing rtl `…` truncation) first.
- New `.differ-branch-group` (added to `branchGroup` in `bpmn-differ-view.js` and
  `dmn-differ-view.js`) with `min-width: 0; flex-shrink: 1`, and the branch
  `<span>` gets `overflow:hidden; text-overflow:ellipsis` — a secondary fallback
  so an extremely long branch label (e.g. after Switch branch) cannot re-overflow
  once the path is already at its base name. Far lower shrink priority than the
  path, so the path truncates first.

`npm test` green (997 pass). Shared classes — verified both BPMN and DMN headers
use the same structure.

Follow-up (same session): the CSS alone fixed wrapping but the right-side buttons
then ran off-screen instead of the path truncating. Root cause confirmed by a
headless-Chrome repro of the exact differ DOM: the layout `<table>` uses the
default `table-layout: auto`, so the single header cell grows to the toolbar's
**max-content** (the full unwrapped width, e.g. 1547px at a 900px viewport) — the
flex container is never bounded, so `flex-shrink` has no negative space and the
path stays full while the toolbar overflows the viewport. `width: 100%` does NOT
help under auto layout (the cell still expands to max-content; measured 1547px).

Fix: set `table.style.tableLayout = 'fixed'` (with `width: 100%`) on the layout
table in **both** `bpmn-differ-view.js#build()` and `dmn-differ-view.js#build()`
(BPMN also gained `width: 100%`; DMN already had it). Fixed layout pins the single
column to the table width, so the header cell is viewport-bounded and cell content
overflows internally → the path left-truncates. Repro measurements after the fix:
table width == viewport at 900/1100/1400px, close button always on-screen, path
width scales with available room (29px @900 → 228px @1100 → 527px @1400). Verified
the nested canvas/props split is preserved (props honored at ~340px, canvas absorbs
the slack). `npm test` green (997 pass).

Follow-up 2 (same session): per the user, the branch/commit label must NEVER
truncate — only the file path. Reverted the secondary branch fallback: removed the
`.differ-branch-group` class (both views) and its CSS rules, so the branch group is
a plain rigid `.differ-btn-group` (flex-shrink:0) and `.differ-file-group` is the
sole shrinkable item (flex-shrink:1, min-width:0). Repro confirms the branch label
stays full ("Changed · feature/TASK-1321", no clipping) at 900/1100px while only
the path truncates and the close button stays on-screen. `npm test` green.
