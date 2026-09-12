---
id: BUG-0031
title: No diff button when the MR shows all files at once ("Show one file at a time" unchecked)
priority: high
status: open
---

## Statement

In an MR, GitLab's "Show one file at a time" preference decides whether the diff
shows a single file or every file stacked in a row. With it **unchecked** — all
files at once — the extension shows no **Schema diff** / **Decision diff** button
at all, whatever the MR contains.

Nothing is selected in that mode, and the extension is built around the idea that
exactly one file is: `GitLabDomScraper#findSelectedFilePath()` looks for a
`[data-path]` element carrying `is-active` / `diff-file-is-active`, finds none,
logs `cannot get file path from data-path element` and returns `null`, so
`App#handleStart` never reaches `addButton()`.

The expected behaviour is the one the mode implies: draw a button **on every
bpmn/dmn file block** in the diff, rather than one button for "the selected file".

Split out of [BUG-0003], which collected three unrelated causes for a missing
button; the other two are fixed and that task is closed.

## Context

- This is not a selector fix. Today the button has a single home — the MR header
  (`GitLabUIRepoProvider#SHOW_DIFF_BTN_PARENT_CONTAINER_SELECTORS`, the
  merge-request tabs container) — and the whole flow assumes one button for one
  selected file. All-files mode needs N buttons anchored to N file blocks, so
  button placement, `isButtonPresent()` and the re-render handling all have to
  learn about multiplicity.
- Both diff UIs have to be covered, and they are scraped differently:
  the legacy one by `[data-path]` + `is-active`, the rapid-diffs one
  (`<diff-file>` custom elements on gitlab.com) by `location.hash`
  (`#findSelectedFilePathInRapidDiffs`). Neither marks anything active when all
  files are shown.
- The file blocks are rendered lazily, so the same debounced `MutationObserver`
  that fixed the late-render case in [BUG-0003] (`App#observeDomChanges`) is what
  has to place buttons on blocks that appear after the first pass. Re-entry has to
  stay cheap: `isButtonPresent()` currently answers for the page, not per block.
- [IDEA-0005] proposes replacing the DOM scraping with `location.hash` + the
  GitLab `diffs_metadata` API. That gives the list of changed files directly,
  which is exactly what this mode needs — worth deciding between the two
  approaches before implementing, rather than scraping harder.
- Code: `src/content/providers/gitlab/gitlab-dom-scraper.js`,
  `src/content/providers/gitlab/gitlab-ui-repo-provider.js`,
  `src/content/app.js`.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
