---
id: UX-0003
title: Improve the display for deleted and new schemas
priority: medium
status: done
---

## Statement

Improve the differ-page behavior for schemas missing in one of the compared versions
(a file deleted in the MR / a new file that is absent in the target branch), and also when the file is missing
in **both** versions.

**Accepted approach** (rather than fully filling the schema with red/green from the original idea —
which was rejected as visually questionable):

1. **The existing side renders as usual**, without per-element coloring and without filling
   the whole schema.
2. **The absence marker goes into the version label**, not a separate banner. When the user
   switches to the side where the file is missing, in place of the branch label (see `BranchIndicator`)
   it states that the schema is absent in this version (a muted/italic style, to distinguish it
   from the normal label). Choose the exact wording during implementation
   ("schema is absent" / "deleted" / "not in this version").
3. **When switching to the absent side, the canvas is cleared** (an empty diagram), instead of
   the current `alert('File does not exist…')`. Diff highlighting and selection are turned off as well.
4. **Both sides absent (BUG-0001)** — instead of a silent blank screen, show a placeholder message on the canvas
   (e.g. "File is absent in both versions"). Do this **in the same session** —
   see [BUG-0001].

We do **not** hide the "Switch branch" button — for a new/deleted schema `sourceRef` exists, so the
button is active anyway; we signal absence via the label + canvas clearing. On the empty side it
makes sense to disable the Highlight button (there is nothing to compare against).

We dropped the items from the original formulation: filling the whole schema with color; hiding the branch-switch
button; coloring all elements of the new schema in the table.

## Context

Linked with [BUG-0001] — **implement jointly** (shared code for the "one/both sides
absent" path). BUG-0001: when a file is deleted both in the MR and in master, the old code crashed on
`requireDefined` (404 loading master). Now `loadFileContent(url, false)` returns
`null`, the crash does not reproduce, but when both sides are empty `run()` does an early `return` →
a blank white page remains. A visible placeholder is needed.

### Codebase research findings (current as of 2026-06-16)

The overall architecture of the BPMN and DMN differs is parallel; the key classes are shared
(`src/differ/shared/`), so most edits are made once for both. When changing shared
classes, check both differs (the rule from CLAUDE.md).

**Detecting an absent version:**
- `src/differ/shared/diagram-versions.js` — `DiagramVersions` holds `#branchXml` (target) and
  `#mrXml` (source); either is `null` if the file is missing. Loading via
  `loadFileContent(url, false)` (`diagram-versions.js:32-34`), 404 → `null`.
- `src/core/utils.js:23-69` — `loadFileContent(url, throwIf404=false)` returns `null` on 404.

**The "both sides empty" points (BUG-0001):**
- `src/differ/bpmn/bpmn-differ.js:100-103` and `:190-196` — early `return` + `console.error`.
- `src/differ/dmn/dmn-differ.js:39-42` and `:84-90` — the same for DMN.

**The version label (where to write "schema is absent"):**
- `src/differ/shared/branch-indicator.js` — `BranchIndicator`. Currently `setShownLabel(label)`
  (`:36-45`) renders "`role · label`" and colors it in the target/MR color; `isTargetBranchShown()`
  (`:47-49`) reflects the current side. Add a method like `setAbsentLabel(label)` for
  the "no schema" state, keeping a correct `isTargetBranchShown()` (needed for Download and
  a repeated switch).
- Used in both differs: `bpmn-differ.js:127`, `dmn-differ.js:60`; the element is mounted
  in the header `bpmn-differ-view.js:226-233`.

**Version switching (where there is currently an alert instead of clearing):**
- `src/differ/bpmn/bpmn-differ.js:207-223` — `#switchBranch()`; the `else` branches call
  `this.#versions.alertFileNotExistInBranch(...)`. Showing a version — `#showBranch()` (`:230-241`),
  `#showMr()` (`:243-254`); XML import — `#importXml()` (`:275-286`, `bpmnJS.importXML`).
- `src/differ/dmn/dmn-differ.js:101-117` — `#switchBranch()` (similarly); `#showMr()`/
  `#showBranch()` `:119-143`; import `#showXml()` `:145+`.
- `src/differ/shared/diagram-versions.js:54-56` — `alertFileNotExistInBranch()` (this is what we
  replace with canvas clearing; also check the call from `download()` `:37-39`).

**Clearing the canvas:**
- BPMN — `bpmn-js` has `bpmnJS.clear()` (an empty canvas).
- DMN — `dmn-js` has no simple `clear()`; the clearing method is **to be determined during implementation**
  (probably importing an empty DMN table or hiding the container). The current import/reset path —
  `dmn-differ.js:#showXml` (`:145+`) + `DmnTableViewport.reset()`. This is the single technically
  unclear point of the plan.

**Highlighting / changes table (what to turn off on the empty side):**
- `src/differ/bpmn/bpmn-differ.js:306-330` — `#highlightDiffs()` calls `diffHighlighter.paint()`
  and `changesTableView.fill()`. On the empty side there is no comparison → reset the table/highlighting,
  disable the Highlight button.
- The Switch/Highlight buttons: `src/differ/bpmn/bpmn-differ-view.js:237-272`
  (`disabled: !isSourceVersionDefined()`); the footer/table is created only when
  `isSourceVersionDefined()` (`:123-128`). The DMN view — `src/differ/dmn/dmn-differ-view.js:133-139`.

### Tests (per the project style — many small unit tests on the public API)
- `BranchIndicator`: `setAbsentLabel` → text/state; `isTargetBranchShown()` after absent.
- If a pure function "where we are switching and whether it is empty there" is extracted — cover it.
- The DOM/`importXML` part — manual check (see `docs/testing.md`).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (freshest first). -->

### 2026-06-16 · claude-opus-4-8 · branch `feature/ux-0003-absent-schemas` (rework per feedback)

At the user's request, the absent-label texts were clarified (instead of the generic "not in this version"):
side-specific, since the opposite side on switch always exists —
- empty source (Changed) → `file deleted` (`BranchIndicator.ABSENT_NOTE_DELETED`);
- empty target (Original) → `file does not exist` (`ABSENT_NOTE_NEW`).
The "both empty" message was brought to `File does not exist in either version`.
Added disabling of the **Download** button on the side without a file (and when both are empty):
`BpmnDifferView`/`DmnDifferView.setDownloadButtonEnabled`, calls from `#showAbsentSide`,
the "both empty" branches, and `#showXml` (turning it back on). Tests updated, `npm test` green (690).

### 2026-06-16 · claude-opus-4-8 · branch `feature/ux-0003-absent-schemas`

Implemented the accepted approach (jointly with [BUG-0001]). Changes:
- A new shared class `DifferEmptyState` (`src/differ/shared/differ-empty-state.js`) — a placeholder
  inside the canvas cell (the toolbar stays accessible, unlike the full-screen
  `DifferLoadingOverlay`). Registered in `utils.js#loadScripts`, `manifest.json`
  (`web_accessible_resources`) and `scope.js#SCOPE_FILES`; styles `.differ-empty-state` in `styles.css`.
- `BranchIndicator.setAbsentLabel(targetSide)` — a muted italic label
  "role · label · not in this version", `isTargetBranchShown()` stays correct;
  `setShownLabel` resets the italic back.
- BPMN (`bpmn-differ.js`): `#switchBranch` instead of an alert calls `#showAbsentSide()` —
  `bpmnJS.clear()` + the absent label + resetting the diff highlighting (`setDiffElementIds([])`),
  `ChangesTableView.clear()` (a new method), resetting the selection, disabling the Highlight button
  (`BpmnDifferView.setHighlightButtonEnabled`); the button is re-enabled in `#showXml`.
- DMN (`dmn-differ.js`): `#switchBranch` → `#showAbsentSide()` — the absent label + an empty
  canvas overlay (`showEmptyState('')`), since `dmn-js` has no `clear()`; in `#showXml`
  the overlay is hidden.
- Both sides empty (BUG-0001): instead of a silent blank screen — `view.showEmptyState('File not
  found in either version')` in both differs.
- `DiagramVersions.alertFileNotExistInBranch` removed; the alert is inlined into `download()` (a separate
  action, the feedback preserved).

Tests: `npm test` green (689). Added unit tests for `DifferEmptyState` and `BranchIndicator.setAbsentLabel`.
The DOM/`importXML` part (rendering an empty canvas, the DMN overlay) — per the manual checklist (`docs/testing.md`).

### 2026-06-16 · claude-opus-4-8 · master (planning, no commit)

Researched the current handling of absent schemas (files/lines — in "Context"). With the user, an
approach was chosen: render the existing side without coloring; the absence marker in the version label;
clearing the canvas when switching to the empty side; a placeholder when both are empty (jointly with
[BUG-0001]). The idea of fully filling the schema and hiding the button was discarded. Implementation — in the next
session (both differs + shared classes), together with BUG-0001 right away.
