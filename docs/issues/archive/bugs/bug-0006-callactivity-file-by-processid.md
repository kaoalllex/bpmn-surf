---
id: BUG-0006
title: 'CallActivity: the called process file is not found by processId'
priority: medium
status: done
---

## Statement

The BPMN file is not always resolved by `processId` (`FactoringReject` and the like). The "dive-in" itself works, the bug is in the resolution.

## Context

- Log: `cannot find bpmn file path by process id: FactoringReject` (`process-file-index.js`).

## Work log

### 2026-06-14 · — · (branch `refactor/call-activity-lazy-load`)

Done: resolution now goes by content — a blob-search for the `<bpmn:process id="...">` declaration (`call-activity-locator.js`), rather than by the "file name = processId" heuristic, so `FactoringReject` and the like are found. The old by-file-name index (`ProcessFileIndex`) is kept as a fallback in case blob-search is unavailable.
