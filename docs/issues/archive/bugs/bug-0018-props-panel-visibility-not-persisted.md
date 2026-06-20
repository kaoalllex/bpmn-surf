---
id: BUG-0018
title: Properties panel hidden/shown state is not preserved across dive-in/out
priority: medium
status: done
---

## Statement

When navigating between diagrams via dive-in / dive-out, the hidden/shown state
of the properties panel is lost: every newly opened differ tab shows the panel,
regardless of whether it was explicitly hidden on the previous diagram.

Expectation: an explicit user choice should stick — if I press "Hide properties",
the panel stays hidden on the diagrams I navigate to; if I press "Show properties",
it stays shown.

## Context

- `bpmn-differ-view.js`: visibility lives only in the private field
  `#isPropsCellHidden = false` and is never persisted. `build()` restores only the
  panel **width** via `#restorePropsWidth()` (`localStorage['bpmnDiffer.propsWidth']`);
  there is no equivalent for the visibility flag.
- Dive-in (`bpmn-differ.js#diveIntoCalledDiffer`) and the fresh-caller-tab path open
  a new differ tab → `build()` → panel shown again.
- Exception: the fast dive-out-to-opener path (FEAT-0023, `focusOpenerAndClose()`) does
  not reload the page, so state already survives there. The bug is only on paths that
  open a new tab.
- DMN differ has no properties panel — BPMN-only.

### Decision: storage scope

Stored **globally** in `localStorage` (key `bpmnDiffer.propsHidden`), consistent with the
panel width. Differ tabs are separate top-level `about:blank` tabs where `sessionStorage`
is not reliably shared, while `localStorage` is the proven mechanism (used for the width).
Consequence: a one-off hide persists across all future tabs/MRs and browser restarts until
the user explicitly shows the panel again — this is the desired "set my preference once"
behavior.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-06-20 · claude-opus-4-8 · branch `fix/props-panel-visibility-not-persisted`

Persist the panel's hide/show choice globally in `localStorage`, like the width —
so an explicit toggle survives navigation into a freshly opened differ tab.

- **`bpmn-differ-view.js`** — new key `PROPS_HIDDEN_KEY = 'bpmnDiffer.propsHidden'`.
  Extracted `#applyPropsHidden(hidden)` (DOM display + button text + flag), shared by
  the toggle and the new `#restorePropsHidden()` (called in `build()` right after
  `#restorePropsWidth()`). The toggle now writes `'1'`/`'0'` to `localStorage`. Restore
  does not refit — the canvas is still `visibility:hidden` and gets fitted on render.
  Stored the toggle button in `#hidePropsButton` so restore can update its label.
  Added pure helper `isPropsHiddenStored(raw)` (mirrors `clampPanelWidth`).
- BPMN-only (DMN has no properties panel). View-only / text-copy paths untouched.
- Tests: `isPropsHiddenStored` cases in `bpmn-differ-view.test.js`. `npm test` green (886).

**Decision:** stored globally (not session-scoped). Differ tabs are separate
`about:blank` tabs where `sessionStorage` is not reliably shared; `localStorage` is the
proven mechanism (already used for the width). A one-off hide therefore persists across
all tabs/MRs until the user explicitly shows the panel again — the desired behavior.
