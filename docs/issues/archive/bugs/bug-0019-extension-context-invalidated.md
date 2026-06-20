---
id: BUG-0019
title: Uncaught "Extension context invalidated" when clicking the diff button on a tab opened before an extension reload
priority: low
status: done
---

## Statement

After the extension is reloaded or updated (manual reload in `chrome://extensions/`
during development, or an auto-update), clicking "Show schema diff" on a GitLab tab
that was opened *before* the reload throws an uncaught error:

```
Uncaught (in promise) Error: Extension context invalidated.
  at src/content/app.js:294
```

Expectation: instead of an uncaught error, the user gets a clear hint to refresh the page.

## Context

- When the extension reloads, content scripts already injected into open tabs are
  orphaned: `chrome.runtime` is dead, so any `chrome.*` call throws. The first such
  call on the click path is `chrome.runtime.getURL(resourceName)` inside
  `App#openDiffer` (`src/content/app.js`).
- An orphaned content script **cannot** revive itself or reload the extension — it has
  no working API access. The only fix for that tab is reloading the page, which injects
  a fresh content script with a valid context.
- Chosen UX (user decision): just a friendly message, no auto-reload. Detect the dead
  context with the cheap `chrome.runtime?.id` check and `alert()` (the same pattern as
  `PageReloader`), then return early — no surprise page reload on a GitLab page.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-06-20 · claude-opus-4-8 · branch `fix/extension-context-invalidated`

Guard at the top of `App#openDiffer` (`src/content/app.js`), before any `chrome.*` call:
if `!chrome.runtime?.id` the context is invalidated → `alert(...)` asking the user to
refresh the page (F5) and return early, instead of throwing the uncaught error.

- Private method, tested only via the public API per the project's test-design rules —
  no unit test added. `npm test` green (886).
- Documented the dev-workflow trap in `docs/testing.md` (Manual checking): reload the
  extension in `chrome://extensions/` after every code change before checking, else you
  verify against stale code; reloading also orphans earlier tabs (this bug).
