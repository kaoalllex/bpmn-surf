---
id: FEAT-0023
title: Return to the calling diagram from a called diagram (back navigation)
priority: medium
status: done
---

## Statement

When the user dives into a called diagram (call activity → called process, or a
called DMN), there is currently no way to go back to the diagram they came from.
Add a "back" navigation that returns to the calling diagram, restoring its state
(viewport/selection if feasible) and, ideally, the element that was dived into.

A breadcrumb / navigation stack is the natural model: each dive pushes the
calling diagram onto a stack, "back" pops it. Support multiple levels of nesting
(A calls B calls C → back from C returns to B, then to A).

## Context

- Complements the existing dive-in flow into call activities and the called DMN
  navigation ([FEAT-0005]).
- Related: [UX-0008] (loading indicator while a call activity is being opened),
  [BUG-0006] (resolving the call-activity target file by process id).
- Open question: scope — is back-navigation only within a single dive session
  (in-memory stack), or should it survive SPA navigation / reload?
- Part of the broader shift toward schema browsing/exploration as a first-class
  use case (not only MR diff).
- **Gates the `bpmn-surf` rename** ([UX-0009]): the rename commit lands only
  after this back-navigation ships — the "surf" name implies free movement
  between schemas (dive in *and* out), which doesn't exist until this is done.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries at the top (most recent first). -->

### 2026-06-19 · claude-opus-4-8 · branch `feature/return-to-calling-diagram`

Implemented "dive out" navigation (tab-based model, variant A — chosen with the
user). The `⤴` control is the mirror of dive-in `⤵` and always moves UP the call
hierarchy to a calling diagram; it lands on "where we came from" only when we got
here by diving in (a coincidence, not the definition — per the user's feedback).
When we dived in, the calling diagram's tab is still live with its state intact,
so dive-out just brings it to the front and closes the current tab.

- **`navigation/caller-locator.js` (new)** — `CallerLocator`, the reverse of
  `CallActivityLocator`: resolves the current diagram's process id(s) → the BPMN
  files that call it (blob-search `calledElement="<id>"`, unioned/cached, self
  excluded). Returns `[]` for a root diagram, **throws** on a failed search.
- **`navigation/back-navigator.js` (new)** — `BackNavigator`, the toolbar split
  "dive out" control `⤴`/`▾`. `⤴`: dived in → jump straight to the open caller
  tab (fast, state-preserved); else open the menu (caller must be searched).
  `▾` lazily lists every caller (even unopened), the one we dived in from marked
  & first (selecting it reuses its tab); the rest open fresh and auto-select
  their call site. Distinct loading/empty/error states (error offers a
  GitLab-search link). Owns only its DOM; side effects injected.
- **`differ-params.js`** — `toNestedDifferParams(filePath, fileName, extra)`;
  `divedInFrom {filePath,fileName}` (dive-in, down) + `selectCalledProcessIds`
  (dive-out, up — auto-select the caller's call site).
- **`bpmn-differ.js`** — wires `CallerLocator`/`BackNavigator`; `#openDifferForFile`
  (shared) with `#diveIntoCalledDiffer` (down, stamps `divedInFrom`) and
  `#diveOutToCallerDiffer` (up, stamps `selectCalledProcessIds`);
  `#diveOutToOpener` (focus opener + close, or reopen as caller if the tab is
  gone); `#focusOpenerAndClose` (empty-URL named-target focus → no reload);
  `#getCurrentProcessIds`; `#applyInitialCallActivitySelection` +
  `#selectIntoPropertiesPanel` (selects the Call Activity calling the diagram we
  came from). The properties panel subscribes to `selection.changed` only in a
  post-mount effect and re-shows the root after import, so a single early select
  is lost (canvas shows the element selected, panel still shows the whole
  diagram). Fix: re-assert the selection (clear→select to force a fresh event)
  until the panel confirms via `propertiesPanel.updated` that it shows the
  element — bounded by `PANEL_SELECT_MAX_ATTEMPTS`/`PANEL_SELECT_RETRY_MS`,
  abandoned if the user selects something else. (`doWithAttempts` on the panel
  container alone was not enough — its first probe runs synchronously, before the
  panel's effect subscribes.)
- **`bpmn-differ-view.js`** — `setBackNavigator()` + renders the group before Close.
- **`styles.css`** — split button + dropdown menu.
- Registries (`utils.js#loadScripts`, `manifest#web_accessible_resources`,
  `test/support/scope.js`) updated; `architecture.md` updated.
- Tests: `caller-locator.test.js`, `back-navigator.test.js` (jsdom). `npm test`
  green (819).

**Scope:** BPMN only. DMN caller-picker is a separate task (per the user). DMN
dive-out is deferred too — there is no DMN dive-in entry point yet, so a DMN page
never has a `divedInFrom`; the control activates once DMN dive-in exists (the
params plumbing is shared).

**Needs manual in-browser check before merge:** the `window.open('', TARGET)`
focus-without-reload trick (Chrome bringing the opener tab forward without
navigating it), and the reverse blob-search on a real GitLab instance.
