---
id: BUG-0035
title: The branch ref selector hint comes back empty on current gitlab.com
priority: medium
status: done
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

### 2026-10-03 · claude-opus-5-5 · branch `fix/bug-0035-slash-branch-ref`

Fixed with both ways out, the DOM first:

- `GitLabDomScraper.findBranchCommitIdText()` keeps the two older markups
  (self-managed) untouched and first in line, then reads current gitlab.com's
  `#js-ambiguous-ref-modal[data-ref]`, which holds the full ref
  (`demo/bug-0035`). Live on gitlab.com this is what now resolves the ref.
- With no hint at all, `GitLabRepoProviderBase` probes the URL-tail prefixes
  shortest-first with `GET /repository/commits/<ref>` (slash sent as `%2F`;
  branches, tags and shas alike), cached per URL; on an API error it keeps the
  first-segment rule. `GitLabUrlParser.blobRefCandidates()` lists the prefixes;
  the log names the source (`resolved by the repository api`).
- `extractBranchCommitIdAndFilePath()` is now async through `RepoProvider`,
  `FallbackRepoProvider` and `app.js` (`#branchFilePath`, `#isButtonUpToDate`,
  `#addBranchButton`, the stale-click check in `#openDiffer`).

Live on the sandbox, blob view of `order-service/…/order/OrderMain.bpmn`: on
`demo/bug-0035` (with the modal, and with it removed so the API path runs — 2
probes, `demo` 404 then `demo%2Fbug-0035`, then cached) the toolbar reads
`Original · demo/bug-0035` with the right path, dive-in on Fulfillment opens
`…/order/fulfillment/Fulfillment.bpmn`, `</>` on "Validate the order" opens
`ValidateOrderHandler.kt#L10` — identical to `main`. `branch-button.mjs` OK on
both. The older markups are covered by unit fixtures only (no self-managed
instance at hand).

Known ceilings, not fixed: a tag named like the ref's first segment (`demo` tag
+ `demo/x` branch can coexist) or a short hex first segment that is also an
abbreviated sha wins the probe — the same answer the first-segment rule gave
before, and only when the page states no ref.

### 2026-10-03 · claude-opus-5-5 · observed during BUG-0038

Seen live on the sandbox, blob view of `test/correlation-no-code/root-level.bpmn`:
the differ took ref `test` and path `correlation-no-code/root-level.bpmn`. The
diagram still loaded (GitLab's `/-/raw/` resolves the ambiguous path itself), but
every navigation search ran at the nonexistent ref `test` — `blob search for
'NoCodeCorrelation' at ref 'test': 0 hit(s)`, and the toolbar shows `Original ·
test`. So on a slash branch the hint is not cosmetic: dive-in, handler badges and
correlation all silently find nothing. The sandbox branch is kept as a repro.
