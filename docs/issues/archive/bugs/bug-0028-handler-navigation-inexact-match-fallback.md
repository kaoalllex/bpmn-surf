---
id: BUG-0028
title: Handler navigation opens a wrong file when no hit matches the topic exactly
priority: medium
status: done
---

## Statement

Navigation to handler code (the `‹/›` badge) can still open the wrong file when the
blob search returns hits but **none** of them declares the searched topic (or class
name) exactly. In that case the pick falls back to the first annotated hit, i.e. it
depends on the order the search API happened to return — the [BUG-0027] failure mode,
narrowed but not removed.

The concrete way this shows up: topic `Order_PrepareItem_FindItems` is a
prefix of `Order_PrepareItem_FindItemsInCatalog`, GitLab blob search is
substring-based, so both files come back; if the declaring file is absent from the
returned page, the Catalog handler is opened instead.

## Context

- Affected code: `handler-locator.js`, the `item = exactMatch || …[0]` fallback in
  `#searchSubscriptionLocation` (topic search) and `#searchClassLocation`
  (`class:` keys and `@ExternalTaskBean`).
- Reported from the field on `PrepareItem.bpmn` — the same diagram and the same topic
  pair as [BUG-0027]. That report turned out to be the **released v1.1.0 build**, which
  predates the [BUG-0027] fix (tag `v1.1.0` = commit `7be7f22`, fix = `322a330`), so it
  was the old order-dependent `.find()` code, not this fallback. The fallback below is
  the residual hole found while investigating it.
- Verified by running the real `resolveLocation` against the recorded GitLab payload:
  the v1.1.0 code returns the wrong file for one result order and the right one for the
  other; current code is order-independent while an exact match exists, and reproduces
  the wrong file only when the declaring file is missing from the hits.
- Possible contributing factor, unverified: `#searchSubscriptionLocation` calls
  `searchCode(ref, topic)` without `options`, so GitLab's default `per_page=20` applies.
  A topic that appears in many files (diagrams, tests, comments) could push the
  declaring handler out of the first page. `CorrelationLocator` already passes an
  explicit `perPage`; the same could be done here.
- Related: [BUG-0027] (the order-dependent `.find()`, fixed), [BUG-0013] (why the search
  term is the bare topic rather than the annotated form).
- Process finding from the same investigation, not tracked here: the [BUG-0027] fix sat
  in master unreleased for a month, and a master build reports the same version string
  as the released zip, so users cannot tell which code they run.

## Fix

Both searches now resolve to `null` when no hit declares the exact topic/class name,
instead of returning the closest hit. `HandlerNavigator` already routes a `null`
location to the repository code-search page for the term (`handler-navigator.js:177`),
so the fix is the removal of the positional guess — the honest outcome ("here is what
I searched for") replaces a file we know does not declare it. The `console.warn` stays:
it is what will show whether this path is hit in practice.

Trade-off accepted: when the declaring file *was* returned but its snippet omits the
literal topic (GitLab truncates snippets), navigation now lands on the search page
rather than on the correct file. The warning makes such cases visible.

Raising `per_page` for these searches is deliberately left out — see [INFRA-0010],
which also covers warning on truncated result sets in general.

## Work log

<!-- Each AI session on the task — a separate entry by the template below.
     Add new entries on top (freshest first). -->

### 2026-08-20 · claude-opus-5[1m] · branch `fix/handler-inexact-match-warning`

Second pass, same session: replaced the positional fallback with `null` in both
`#searchSubscriptionLocation` and `#searchClassLocation`, so an inexact resolution now
ends on the code-search page through the existing `HandlerNavigator` path. Updated the
real-path test to assert `null` plus the warning. Verified: 1083 unit tests and the 8
handler-badge e2e specs green (the e2e run also needed `npx playwright install chromium`
on this machine — the cached browser build did not match the pinned Playwright).

### 2026-08-20 · claude-opus-5[1m] · `50903cd` (branch `fix/handler-locator-inexact-match-log`)

Investigated a field report of wrong handler navigation; established it was the
unreleased [BUG-0027] fix, and found this residual fallback while doing so. Made the
fallback observable instead of silent: both `#searchSubscriptionLocation` and
`#searchClassLocation` now `console.warn` the searched term, the number of handler hits
and the file they fell back to (the differ page timestamps `console.warn`, so it lands
in the logs users send with bug reports). Pinned the behaviour with two tests that drive
the real `resolveLocation` path — order-independence and the fallback warning; the
existing [BUG-0027] tests only re-implemented the selection logic inline and would not
have caught a regression in the production method. The fallback itself is unchanged, so
the task stays `partial`.
