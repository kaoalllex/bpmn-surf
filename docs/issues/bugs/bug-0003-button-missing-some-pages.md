---
id: BUG-0003
title: BPMN Diff button is not shown on some pages
priority: high
status: open
---

## Statement

Find and fix the detection problems for eligible GitLab pages; add diagnostics for the reasons the button is hidden.

## Context

- Special case: when the "Show one file at a time" checkbox is unchecked, GitLab shows all files in a row, and the plugin does not understand that a bpmn/dmn file is selected → there is no button. The button must be drawn immediately for all bpmn/dmn file blocks. **(still open)**
- Lazy-render race (single-file mode): selecting a bpmn file makes GitLab swap the diff DOM asynchronously. When the render takes longer than `findSelectedFilePath()`'s ~1.5s detection budget (`doWithAttempts` in `gitlab-dom-scraper.js`), the `mouseup` run finds no `[data-path]`/`<diff-file>` element and gives up (`cannot find data-path element` → `file not selected`). Nothing re-triggers on the late render (only `mouseup`/`popstate` are listened to), so the button appears only on a second manual click. **Fixed** via a debounced `MutationObserver` (see work log).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-06-22 · claude-opus-4-8 · branch `fix/diff-button-late-render`

Fixed the lazy-render race (variant B). `App.#observeDomChanges()` (`src/content/app.js`)
now watches `document.body` with a debounced `MutationObserver` and re-runs
`#handleStart` when GitLab finishes rendering the diff — so the button no longer
requires a second click. No self-trigger loop: the diff button lives in the
stable MR header (not inside the diff content), and retries are skipped while the
button is already present (`UIRepoProvider.isButtonPresent()`, implemented in
`GitLabUIRepoProvider`). The "Show one file at a time unchecked → button per
block" case remains open. Future direction recorded in [IDEA-0005] (read the
selected file from `location.hash` + GitLab `diffs_metadata` API instead of
scraping the lazily-rendered diff DOM).
