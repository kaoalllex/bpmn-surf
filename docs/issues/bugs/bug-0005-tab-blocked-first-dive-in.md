---
id: BUG-0005
title: Chrome blocks opening a tab on the first Dive-in (CallActivity)
priority: medium
status: partial
---

## Statement

On the first click on "Dive in", bpmn files load slowly and asynchronously, so Chrome blocks opening a new tab. On subsequent clicks (data already in the cache) everything is fine.

## Context

- Code: `call-activity-navigator.js`, `call-activity-locator.js`.
- Remaining: opening the tab still happens after the `await` (file resolution), so a popup block on the very first click is in principle possible — if needed, open the tab synchronously on click and navigate after resolution (as in `handler-navigator.js#onOpenCode`). The cache is in memory only, not in Chrome's DB (on different tabs the resolution is repeated, but that is already a single lightweight request).

## Work log

### 2026-06-14 · — · (branch `refactor/call-activity-lazy-load`)

Substantially improved: the heavy loading of the entire repository tree is removed from the main path — `CallActivityLocator` does a single targeted blob-search by `<bpmn:process id="...">`, so there is no longer a long asynchronous load; the three-mode badge (`Load process / Loading…`) is also removed. The result is cached in memory for the session.
