---
id: BUG-0033
title: Repository lookups pass a null ref when comparing against a local file
priority: medium
status: done
---

## Statement

When a diagram is compared against a **local file** ("Diff with local"), every
repository lookup made from the local side queried the repository at `ref=null`:

```
loading process params for process 'Call1' in ref 'null'
…/api/v4/projects/57703231/repository/tree?ref=null&recursive=true&per_page=100&page=1
response status: 404
warn [call-activity-locator.js:89]: fallback process index failed for 'Call1'
```

So diving into a Call Activity from a local-file comparison never resolved, and the
"search the repository instead" tab it falls back to opened a URL with `ref=null` too.

## Context

`#getShownRef()` (both `bpmn-differ.js` and `dmn-differ.js`) answered
`isTargetBranchShown() ? targetRef : sourceRef`. A local file has no ref in the
repository, so `sourceRef` is `null` — and the local side is the one the differ shows
first. Every ref-taking consumer hangs off that one method:

- `CallActivityLocator.resolveProcessFile` → `searchCode(null, …)`. Its own
  `if (!ref) return null` guard swallowed the blob search silently (no request in the
  log at all), which is why the symptom surfaced one layer down.
- `ProcessFileIndex.findProcessFileParams` → no guard → `tree?ref=null` → 404.
- `CallActivityLocator.blobSearchPageUrl` → no guard → a broken search page URL.
- The same `null` reached decision dive-in, handler-code navigation and correlation
  search, which take the ref through the same method.

Fixed at that single source rather than by a guard per consumer: when the shown side
has no ref of its own, lookups use the ref of the version it is being compared with —
the only repository version in play. Branch-only mode is unaffected (the source side
is never shown there, so the fallback never triggers).

Found by reading a [FEAT-0024] feedback report: the prefilled issue carried the
`ref=null` request and the 404 straight out of the user's console.

### Relations

- [FEAT-0024] — the in-product feedback report that surfaced this.
- [FEAT-0023] / [FEAT-0005] — the dive-in and handler-navigation features affected.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-09-21 · claude-opus-5 · branch `feature/feat-0024-differ-feedback`

Root-caused and fixed in `#getShownRef()` in both orchestrators; the shared consumers
needed no change. Pinned by `test/e2e/differ-dive-in-local-file.spec.js`: a local-file
comparison dives in at the compared ref (the blob search runs at all, and against
`base-sha`), and an ordinary MR diff still dives in at the shown MR ref — the second
case fails if the fix degenerates into "always use targetRef". `FakePlatformClient`
now records its `searchCode` calls and the boot helper exposes the client on `window`,
so a spec can assert which ref was queried.

Fixed inside the FEAT-0024 branch by the user's decision, as its own commit.
