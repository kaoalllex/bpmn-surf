---
id: FEAT-0020
title: Open the schema's XML source at the selected element (context menu)
priority: medium
status: open
---

## Statement

Allow opening, from the differ, the **raw XML source** of a `.bpmn`/`.dmn` file
on GitLab and immediately positioning on the fragment of the **selected element**.

The entry point — a **right-click context menu** on a canvas element. The menu item
(e.g. "Open XML source") opens in a new tab:

- **a changed element** → the file on the **diffs** page of the corresponding MR;
- **an unchanged element** → the **blob** of the needed branch/commit with an anchor `#L<line>`
  on the element's fragment.

That is, the target depends on the element's `diffType` (added/changed/removed → MR diff;
unchanged → blob of the target/source branch).

## Context

### What is reused

- **The raw XML of both versions is available at runtime** — `DiagramVersions.branchXml`
  and `.mrXml` (`src/differ/shared/diagram-versions.js`). No additional loading
  is required.
- **File links are already built** in `src/differ/navigation/handler-locator.js`:
  - `blobFileUrl(filePath, line, ref)` → `…/-/blob/<ref>/<path>#L<line>` —
    **supports a line anchor**;
  - `mrFileDiffUrl(filePath, mrIid)` → `…/-/merge_requests/<iid>/diffs#<sha1(path)>` —
    an anchor **only to the file** (GitLab does not provide a stable line anchor in a diff).
- **Element selection is already tracked** — `BpmnDiffer` listens to
  `selection.changed` on the bpmn-js eventBus (`src/differ/bpmn/bpmn-differ.js:138`),
  `element.id` / `element.businessObject.id` are available.
- **The overlay-navigation pattern** (call activity `⤵`, handler `</>`) —
  `src/differ/navigation/call-activity-navigator.js`,
  `handler-navigator.js` — a template for how to attach an action to the selected element.

### Key limitation: the element's position in the XML

moddle (bpmn-moddle/dmn-moddle) **does not preserve** the line/column of the source XML —
neither in `businessObject` nor in `di`. Therefore the line number for the blob anchor must be
**computed by ourselves**: by a text search over the raw XML
(`branchXml`/`mrXml`) for a fragment of the form `id="<elementId>"` and converting the offset to a
line number. This is a pure function — extract it and cover with unit tests (see below).

### Open questions (to resolve during the work)

- **Context menu — new infrastructure.** Currently a right-click on the canvas is
  **not handled**; there is no ready-made menu component in the project. Options: a lightweight
  custom DOM menu on the canvas's `contextmenu` event, or
  `diagram-js`/`bpmn-js` ContextPad (but ContextPad is not a right click).
  Design a minimal custom menu, extensible for future items.
- **DMN parity.** dmn-js has several views (DRD/tables); check that
  a right click and id resolution work in the current view; possibly limit to DRD.
- **Elements without a clear id in the XML / without a figure** (sequence flow, process) —
  the behavior of the line search and the menu item for them.
- **Which ref for the blob of an unchanged element** — the target or source branch
  (for unchanged they match by content; choose source/MR-head as
  "what the user sees").
- **Line-search miss** — if `id="…"` is not found in the XML (non-standard
  serialization): fall back to a blob without an anchor (to the file).

### Tests

- The pure function "id → line number in XML": an element at the start/middle/end;
  an id with different quotes/attributes; absence of an id → null/fallback; CRLF vs LF.
- Target selection by `diffType` (changed → MR diff URL; unchanged → blob#L) —
  on mocks of the URL builders.

### Links

- [FEAT-0008] — opening at a branch/commit (ref resolution, to be reused).
- Navigation overlays [FEAT-0003]/[FEAT-0004] — a template for an action on an element.

### Affected files (expected)

- a new canvas context-menu component (e.g. `src/differ/navigation/`
  or `src/differ/bpmn/`), subscription to `contextmenu`.
- a new pure function "id → XML line" + its tests in `test/differ/`.
- `handler-locator.js` — reuse `blobFileUrl`/`mrFileDiffUrl`
  (unchanged, or extract URL building into a shared place).
- shared differ-page classes → check both BPMN and DMN differs.

## Work log

<!-- Each AI session on the task is a separate entry per the template below.
     Add new entries at the top (freshest first). -->
