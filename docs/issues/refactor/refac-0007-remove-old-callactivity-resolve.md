---
id: REFAC-0007
title: Remove the old CallActivity schema resolution mechanism
priority: low
status: open
---

## Statement

Once the blob-search resolution (`CallActivityLocator`, branch `refactor/call-activity-lazy-load`, 2026-06-14) has proven reliable in practice — remove the fallback to the old CallActivity schema resolution mechanism.

## Context

Remove:

- the `process-file-index.js` file (`ProcessFileIndex`), its construction, and the field in `bpmn-differ.js`;
- the fallback branch in `CallActivityLocator`;
- the localStorage cache;
- the `Process` suffix / name capitalization heuristics and deep parsing of all `.bpmn` files.

At the same time, remove `process-file-index.js` from `manifest.json` and `utils.js#loadScripts`.

Related to [BUG-0006].

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
