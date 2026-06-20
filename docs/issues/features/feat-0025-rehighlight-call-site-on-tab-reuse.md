---
id: FEAT-0025
title: Re-highlight the call site when reusing an already-open caller tab
priority: low
status: open
---

## Statement

After [BUG-0017], navigating to a diagram that is already open in another tab
reuses that tab instead of opening a duplicate. For dive-OUT (stepping up to a
caller) this drops the call-site highlight: when a caller tab is opened fresh, it
auto-selects the element from which it calls the diagram we came from
(`selectCalledProcessIds` → `#applyInitialCallActivitySelection`), but when an
existing caller tab is reused, that selection never runs — the tab just comes to
the front showing whatever state it was left in.

Make tab reuse carry the same highlight: when `#openDifferForFile` reuses an open
tab AND the navigation carried `selectCalledProcessIds`, tell the reused tab to
select that call site now, just as a freshly opened one would.

Scope: BPMN callers (Call Activity → `calledElement`) and DMN→BPMN callers
(Business Rule Task → `decisionRef`) — both go through the shared
`selectCalledProcessIds` plumbing, so one mechanism covers both. Dive-IN carries
no selection, so it is unaffected.

## Context

- Introduced by [BUG-0017] (cross-tab dedup via the `BroadcastChannel` registry in
  `differ-tab-navigator.js`); the trade-off is documented there. Builds on the
  back-navigation feature [FEAT-0023] and the called-DMN navigation [FEAT-0005].
- The current selection path runs once, after import:
  - `bpmn-differ.js#applyInitialCallActivitySelection` reads
    `this.#params.selectCalledProcessIds`, finds the matching `bpmn:CallActivity`
    (by `calledElement`) or `bpmn:BusinessRuleTask` (by `decisionRef`) in the
    `elementRegistry`, and selects it.
  - `#selectIntoPropertiesPanel` re-asserts the selection until the properties
    panel confirms it shows the element (bounded by `PANEL_SELECT_MAX_ATTEMPTS` /
    `PANEL_SELECT_RETRY_MS`), because the panel subscribes to `selection.changed`
    only after its async first mount. This logic must be reusable on demand.
  - The DMN side stores `selectCalledProcessIds` too; today only the BPMN
    orchestrator acts on it (a reused tab is most often a BPMN caller).

### Proposed approach

1. **Find the reused tab's window.** `focusExistingDifferTab(identityKey)` already
   gets the window via `window.open('', name)` — return that window reference (or
   `true`) so the orchestrator can message it. Keep the focus-only behavior when
   there is nothing to send.
2. **Send the selection.** In `#openDifferForFile`, when the tab was reused and
   `extra.selectCalledProcessIds` is set, `postMessage` a message
   (e.g. `{ id: <SELECT_MSG_ID>, ids: [...] }`) to the reused window. Reuse the
   existing `msg.origin === window.origin` guard pattern.
3. **Receive and apply.** Add a runtime message listener in `BpmnDiffer` (and
   `DmnDiffer` if a DMN caller can be reused) that, on this message, sets the ids
   and re-runs the selection routine. Extract the select-by-ids logic so it can be
   invoked both initially and on this message, including the panel re-assert loop.
4. **Bring to front + focus the canvas** so the highlight is visible (the tab is
   already focused by the registry; ensure the selection is also scrolled into
   view if it is off-screen — see how the initial selection handles viewport, if
   at all).

### Acceptance criteria

- Open A→C, then on C step up to caller B (B opens, highlights its call site to C).
  Go back to C, step up to B again (or dive into something that reuses B): B comes
  to the front AND re-highlights the relevant call site.
- A sibling/independent open tab for a caller, when reused via dive-out, also
  re-highlights.
- Dive-IN (no `selectCalledProcessIds`) still just focuses, no errant selection.
- The "came from" (↩) and ⤴ paths (which use `focusOpenerAndClose`, not
  `#openDifferForFile`) are unchanged, or — if cheap — also re-assert the call
  site; decide during implementation, do not regress them.
- If the reused tab is mid-load (import not finished), the selection still lands
  once the diagram is ready (the panel re-assert loop already tolerates this).

### Edge cases / risks

- The reused tab may currently show a different selection the user made — the
  re-highlight will override it. Acceptable (the user explicitly navigated to a
  call site), but note it.
- Cross-origin / closed window between focus and message: guard like the existing
  opener tricks; a failed message must not throw.
- Keep it view-only and copy/selection-safe per the differ rules (selecting an
  element programmatically must not interfere with text selection/copy).

### Affected files (anticipated)

- `src/differ/shared/differ-tab-navigator.js` — return the reused window /
  message it.
- `src/differ/bpmn/bpmn-differ.js` — message listener + reusable select-by-ids;
  send on reuse in `#openDifferForFile`.
- `src/differ/dmn/dmn-differ.js` — same, if DMN callers can be reused.
- Tests: `differ-tab-navigator.test.js` (returns the window / posts the message),
  plus orchestrator-level coverage of the select-by-ids routine if it is extracted
  into something testable.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
