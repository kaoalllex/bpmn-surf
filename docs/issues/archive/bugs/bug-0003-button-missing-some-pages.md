---
id: BUG-0003
title: bpmn-surf button is not shown on some pages
priority: high
status: done
---

## Statement

Find and fix the detection problems for eligible GitLab pages; add diagnostics for the reasons the button is hidden.

## Context

- Special case: the "Show one file at a time" checkbox unchecked → all files in a row and no button at all. **Split out into [BUG-0031]** — it needs a button per file block, not a better detector.
- Lazy-render race (single-file mode): selecting a bpmn file makes GitLab swap the diff DOM asynchronously. When the render takes longer than `findSelectedFilePath()`'s ~1.5s detection budget (`doWithAttempts` in `gitlab-dom-scraper.js`), the `mouseup` run finds no `[data-path]`/`<diff-file>` element and gives up (`cannot find data-path element` → `file not selected`). Nothing re-triggers on the late render (only `mouseup`/`popstate` are listened to), so the button appears only on a second manual click. **Fixed** via a debounced `MutationObserver` (see work log).
- Fluid layout: GitLab adds the `.is-merge-request` marker to `.merge-request-tabs-container` only when the user's "Layout width" preference is Fixed (`'is-merge-request' if !fluid_layout` in `app/views/projects/merge_requests/_page.html.haml`). All three button-container selectors required that class, so users with Fluid layout got `Cannot find button parent container by selectors ...` and no button at all. **Fixed** — the tolerant fallback selector no longer requires it.


## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-09-12 · claude-opus-5 · `51ef3a1`

Closing. This task collected three unrelated causes for a missing button; two are
fixed (the lazy-render race and the Fluid-layout selector, see the entries below)
and the diagnostics asked for in the statement are in place — every give-up path
logs its reason (`cannot find data-path element`, `cannot get file path from
data-path element`, `Cannot find button parent container by selectors ...`).

The third case — "Show one file at a time" unchecked — is now [BUG-0031]. It was
never the same defect: the other two are detection failures for a file that *is*
selected, while that one has no selection at all and needs a button per file
block, which changes where the button lives.

### 2026-09-07 · claude-opus-5 · branch `fix/mr-tabs-container-fluid-layout`

Fixed the Fluid-layout case: dropped `.is-merge-request` from the tolerant fallback selector in
`gitlab-ui-repo-provider.js` (the other two, version-specific selectors are untouched).
Regression test `fluidLayoutHeaderMarkup` added in `gitlab-ui-repo-provider.test.js`. `npm test`: 1176 pass, 0 fail.
The "show all files at once" case of this task remains open.

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
