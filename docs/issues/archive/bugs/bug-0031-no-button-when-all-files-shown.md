---
id: BUG-0031
title: No diff button when the MR shows all files at once ("Show one file at a time" unchecked)
priority: high
status: done
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

### 2026-09-25 · claude-opus-5 · no code change

Re-checked on the test sandbox; the symptom is narrower than "no button at all",
because `findSelectedFilePath` has since grown a rapid-diffs branch with a
fallback of "exactly one diagram in the whole MR":

- MR !2 (one `.bpmn` among several other files) — the button **is** shown, and
  permanently, whatever the reader is looking at. The fallback fired.
- MR !3 (one `.bpmn` + one `.dmn`) — no button, because the fallback wants
  exactly one diagram and there are two.

So the statement above still holds wherever an MR has zero or several diagrams;
with exactly one it now shows a button that follows the MR rather than the file.
That makes the prescribed fix — a button per diagram file block — the right one
either way, and adds a cheaper middle ground: while a single toolbar button
remains, name the file on it, so a permanent button at least says what it opens.

Unrelated to [BUG-0036] (a stale button after switching files), which was found
in the same session and is fixed.

Useful for whoever picks this up: the diff anchor is `sha1(<file path>)` — element
ids on the live page match it exactly, and `HandlerLocator#mrFileDiffUrl` already
relies on it. So "which diagrams are in this MR" needs no DOM at all: the changes
API lists them (already fetched and cached for the handler badges) and each one's
anchor is computable. That leaves only "where to attach a button per file", which
can hang off `#<sha1>`. [REFAC-0016] proposes exactly this move for the selected-
file lookup; doing it first makes this task mostly a placement problem.

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-09-27 · claude-opus-5-5 · branch `fix/per-file-diff-button`

Fixed by attaching the button to the file instead of guessing a selected file.
Every bpmn/dmn file block of the MR diff now carries its own `[icon] Schema diff` /
`Decision diff` button before its ⋮ menu. This works in both diff modes and in both
UIs (rapid diffs on gitlab.com, the legacy Vue diffs that self-managed serves).
The MR-header button is gone, and so is the whole "which file is selected" lookup:
`findSelectedFilePath`, the remembered rapid-diffs path, the single-diagram
fallback, the `doWithAttempts` poll, disable/enable and the stale-click guard.

It also resolves the report of 2026-09-27. With rapid diffs, the previous file's
button stayed clickable for about a second after another file was picked:
[BUG-0041] only disabled it while the re-check ran. Now the button lives inside
its own file's block. A CSS rule hides it while rapid diffs greys the old file
out (`.rd-app-diffs-list-loading-overlay[data-loading="true"]`).

Measured before the change: the rapid-diffs tree marks the new file active in
~20 ms, the old `<diff-file>` is replaced at ~520–620 ms, and the legacy UI
removes the old block at once.

Verified with the new `live-check` skill's matrix. It covers both diff modes ×
both UIs × inline/side-by-side, across a modified diagram next to code, added,
deleted, renamed, dmn, bpmn + dmn, merged, many files (30) and code only. It also
covers the walk through the file tree (no visible button during the grey-out)
and the branch view.

Found along the way: the accent (`.bpmn-surf-btn-accent`) never applied on current
GitLab. GitLab's `.gl-button.gl-button.btn-default` outranks a single class, so
the buttons looked native-grey. The accent now redefines GitLab's
`--gl-button-default-primary-*` variables on our button, with a lighter variant
under `html.gl-dark`.
