---
id: BUG-0005
title: Chrome blocks opening a tab on the first Dive-in (CallActivity)
priority: low
status: partial
---

## Statement

On the first click on "Dive in", bpmn files load slowly and asynchronously, so Chrome blocks opening a new tab. On subsequent clicks (data already in the cache) everything is fine.

## Context

- Code: `call-activity-navigator.js`, `call-activity-locator.js`.
- Remaining: dive-in (`call-activity-navigator.js#onDiveIn`, `decision-navigator.js#onDiveIn`) still opens the tab after the `await`s (file resolution, then the ≤150 ms cross-tab registry query), so a block is possible when they outlast Chrome's ~5 s user-activation window — e.g. signed out on a large repository, where resolution falls back to paging the repository tree. Pre-opening the tab on click is **not** a drop-in fix here: opening a popup consumes the activation, and the dedup path (BUG-0017) then cannot bring an already-open tab to the front with `window.open('', name)`. If a block is ever observed, `openDiffer` now tells the user (allow pop-ups or click again — the second click hits the in-memory cache).

## Work log

### 2026-10-05 · claude-opus-5-5 · branch `release/v1.3.0`

The MR "Schema diff" / "Decision diff" button (`app.js#openFileDiff`) and the branch
"View schema" button (`app.js#openDiffer`) now open `about:blank` synchronously on click
and hand it to `openDiffer`, which fills it after the awaits (`buildDiffParams`,
`getTargetFilePath` — the MR `changes` request on a large MR). A click that turns out
stale or fails closes that tab. `openDiffer` alerts the user when Chrome blocks the tab
instead of only logging `failed to open new window`. Dive-in left as is — see Context.
Test: `test/content/app.test.js` (tab opened before the params resolve, closed on
failure / stale view). `npm test` 1339 pass; Layer-2 dive-in/handshake/dedup specs pass.

### 2026-06-14 · — · (branch `refactor/call-activity-lazy-load`)

Substantially improved: the heavy loading of the entire repository tree is removed from the main path — `CallActivityLocator` does a single targeted blob-search by `<bpmn:process id="...">`, so there is no longer a long asynchronous load; the three-mode badge (`Load process / Loading…`) is also removed. The result is cached in memory for the session.
