---
id: BUG-0035
title: The branch ref selector hint comes back empty on current gitlab.com
priority: medium
status: open
---

## Statement

`GitLabDomScraper.findBranchCommitIdText()` returns `null` on gitlab.com's blob
page, so the ref that page states is never read. It tries two markups:

- `div.ref-selector` → `.gl-dropdown-button-text`
- `button.js-project-refs-dropdown`

Neither matches what gitlab.com renders today (observed 2026-09, extension 1.2.0).

## Context

Alone this is invisible — [BUG-0034] made ref/path parsing derive an unslashed
ref from the URL without the hint, which covers `main`, `master`, any
single-segment branch, any tag and any commit sha. The hint is now needed for
exactly one case: a ref that contains a slash (`release/1.2`, `feature/foo`).
There the URL is genuinely ambiguous — `/-/blob/release/1.2/dir/a.bpmn` could be
ref `release` + path `1.2/dir/a.bpmn` just as well — and only the page knows.

The differ logs which rule resolved the ref (`branch ref '…' resolved by the
first url segment`), so a wrong split is now visible in a feedback report rather
than silent.

Two ways out, in order of preference:

1. Fix the selectors, following the project's established pattern of a candidate
   list (see `GitLabUIRepoProvider.#SHOW_DIFF_BTN_PARENT_CONTAINER_SELECTORS`).
   Needs a live page to read the current markup from.
2. Verify the candidate split against the API: git forbids `refs/heads/feature`
   and `refs/heads/feature/foo` from coexisting, so at most one prefix of the URL
   tail can be a real branch — one cached `GET /repository/branches` makes the
   split deterministic with no DOM dependency at all. Costs a request and turns
   `extractBranchCommitIdAndFilePath` async, which ripples through `RepoProvider`
   / `FallbackRepoProvider` / `app.js`.

## Work log
