---
id: IDEA-0005
title: Detect the selected MR file via location.hash + GitLab API instead of scraping the diff DOM
priority: low
status: open
---

## Statement

Stop reading the **currently selected MR file** from the lazily-rendered diff
DOM (`[data-path].is-active` / `<diff-file>` in `gitlab-dom-scraper.js`). Instead
derive it from `window.location.hash` (set synchronously when a file is selected,
before the diff content renders) and map that hash to a file path via the GitLab
API. This would remove the timing race fixed pragmatically under [BUG-0003] at
its root, and reduce the dependency on GitLab's fragile diff markup.

## Context

- **Why this is even possible here.** The MR **Schema diff** / **Decision diff**
  button is injected into the stable MR sticky-header tabs container
  (`merge-request-tabs-container`, see `GitLabUIRepoProvider.addButton`), **not**
  next to the file's diff block. So placement never needs the lazily-loaded diff
  content — only the *detection* of "which file / which type" currently does.
- **What the API can and cannot do.** No GitLab API exposes "which file the user
  is currently viewing" — that is pure front-end SPA state. The API can only
  enumerate the *changed* files. So a client-side selection signal is mandatory;
  the cheap, race-free one is `location.hash` (updated on click, ahead of the
  content render), not the diff DOM.
- **Sketch.** On a re-run: read `location.hash` → map it to a file path via an
  API listing of changed files with their per-file hash → detect bpmn/dmn by
  extension → build params (already API-based) → place the button in the header.
- **Precedent in the codebase.** The rapid-diffs branch
  (`GitLabDomScraper.#findSelectedFilePathInRapidDiffs`) already reads
  `window.location.hash` and falls back to "single diagram file in the MR → use
  it" when there is no explicit selection.
- **Costs / open questions (why it is an idea, not a task yet):**
  - The hash exists only when a file is explicitly selected. On first landing on
    the Changes tab GitLab may not set it immediately → need a fallback (e.g. the
    rapid-diffs single-diagram heuristic, or degrade to the DOM path).
  - Mapping hash → path needs the per-file hash. The frontend gets it from the
    internal `diffs_metadata.json` / `diffs_batch.json` endpoints (`file_hash`),
    which are **not** a documented public contract; the alternative — reproducing
    the hash (SHA over the path) ourselves — couples us to a GitLab-version
    implementation detail. This is its own fragility, traded against DOM scraping.
  - The "Show one file at a time" unchecked case (all files in a row — the still
    open part of [BUG-0003]) is a separate problem this does not solve.
- **Decision (2026-06-22):** for the immediate bug we shipped variant B
  (debounced `MutationObserver` re-trigger) — lower risk, no new API coupling.
  This idea is kept for a future, deliberate reduction of DOM dependence. See
  [BUG-0003].

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
