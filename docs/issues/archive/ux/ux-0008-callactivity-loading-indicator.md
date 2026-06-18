---
id: UX-0008
title: Loading indicator when diving into a call activity (and during rendering)
priority: medium
status: done
---

## Statement

When clicking the "dive in" badge on a call activity, visually nothing happens: resolving the nested process can take from a second to tens of seconds, while the user sees an unchanged screen and thinks the click did not work. A visible loading indicator (spinner/overlay) is needed from the click until the nested process diagram opens. There is currently no spinner in the project at all — it is worth reusing the same one as a safety net during the differ-page rendering.

## Context

The dive-in flow (see the log):

- a click on the badge — `#onDiveIn(processId)` in `src/differ/navigation/call-activity-navigator.js`;
- resolution — `call-activity-locator.js#resolveProcessFile()`: first a blob-search via the API, on a miss (`blob-search missed process ...`) — a fallback;
- the fallback — `process-file-index.js`: `loading project files...` loads the **entire** repository tree page by page (in the log ~80 pages of `repository/tree?...page=N`), then parses each `.bpmn` in turn, looking for the process id. This is the main source of delay (tens of seconds);
- success → `openDiffer()` (`src/core/utils.js`) opens a new tab; a miss → the GitLab search opens (`opening GitLab search for: ...`).

Currently there is neither a spinner nor an overlay along this whole path. On the differ page (the classes are shared by BPMN and DMN) there is no loading indicator either: `showCanvas()` simply switches the canvas's `visibility: hidden → visible`.

Direction of the solution:
- show the indicator right after the click on the badge (on the source differ page) and/or on the freshly opened differ tab — until `ready!`;
- a shared spinner/overlay mechanism for the differ page (reused by BPMN and DMN), hidden in `showCanvas()`;
- the indicator is needed regardless of speeding up the rendering ([PERF-0003]) — even after optimization, resolving the nested process via the fallback stays slow.

Links: [PERF-0003] (asynchronous schema rendering — the same spinner covers the delay), [PERF-0001] (speed up/shorten the fallback tree traversal itself), [BUG-0005] (the tab freezing on the first dive-in), [BUG-0006] (resolving the call-activity file by process id).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (freshest first). -->

### 2026-06-16 · claude-opus-4-8 · branch `feature/ux-0008-loading-indicator`

Implemented a loading indicator at two phases of diving into a Call Activity.

**The dive-in badge (the main long resolution processId→file).** In `call-activity-navigator.js`, during the resolution (`#isHandling`) the arrow badge ⤵ turns into a `.differ-spinner-inline` spinner and returns to the arrow on completion (the `#refreshBadge` method, called at the start and in `finally` of `#onDiveIn`). If during an unfinished resolution another Call Activity is selected, its badge is also drawn as a spinner — making it visible that the same loading is still in progress.

**Differ-page rendering (a safety net, shared by BPMN and DMN).** A new class `DifferLoadingOverlay` (`src/differ/shared/differ-loading-overlay.js`) — a full-screen spinner; `BpmnDifferView`/`DmnDifferView` show it in `build()` and hide it in `showCanvas()`. It covers the blank tab of a freshly opened (including nested) differ until `ready!`.

The spinners use a shared `differ-spin` keyframe in `styles.css`. The new file is registered in `manifest.json#web_accessible_resources`, `utils.js#loadScripts`, `test/support/scope.js`. Unit tests — `test/differ/shared/differ-loading-overlay.test.js` (8 tests). `npm test` green (670).
