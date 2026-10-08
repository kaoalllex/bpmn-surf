---
id: INFRA-0010
title: Warn on truncated API results and review whether the logs identify user problems
priority: high
status: partial
---

## Statement

The console log a user sends with a bug report (Report a problem attaches its tail)
should be enough to identify the cause without a guessing round-trip. What is left:

1. **Warn when a code search may be truncated.** `searchCode` reads one page, now of 100
   hits (GitLab's maximum, see the work log). When a response has exactly as many items as
   the page size, log a `console.warn` with the term, the ref and the count: from that
   point "not found" and "found the wrong one" cannot be told apart from "was on a page
   that was never read". One place covers all seven callers — `GitLabPlatformClient.searchCode`.
2. **Warn when the MR file list is truncated.** Both readers of the MR `changes` API ignore
   GitLab's truncation signal (`overflow: true`; `changes_count` then comes back as the
   string `"1000+"`). Log a warning with the MR iid and the returned count in:
   - `GitLabPlatformClient#prChangedFiles` — `HandlerLocator.findChangedHandlers` scans this
     list, so a changed handler beyond the cut gets no badge while the differ looks fine;
   - `GitLabRepoProviderBase#loadRenameMap` — a renamed diagram beyond the cut has no
     target-side path, so the target version is not found and the file shows as added.
3. **Review the logging as a whole.** Go over the differ page and the content scripts and
   judge whether the current `console.debug`/`warn` lines let us pinpoint a failure from the
   log alone; add what is missing, drop what is noise.

## Context

- Origin: the [BUG-0028] investigation. The user's log showed the search URL and nothing
  else — not which candidates came back, not why one of them was picked — so identifying
  the cause needed the raw GitLab payload and a local re-run. The fallback warning added
  in `50903cd` is the pattern to generalise. `console.warn` is timestamped on the differ
  page (`ConsoleLog.install`), so it lands in what users paste.
- **Why the search is truncated at all.** GitLab's basic blob search is tokenised: a term
  like `calledElement="Payment"` also matches every file containing `calledElement`, and the
  locators filter the hits for the exact match afterwards. The `filename:`/`extension:`
  filters that would narrow it work only with advanced or exact code search, which an
  instance may not have. Visible effect of a truncated page: the list of calling diagrams
  is silently incomplete; the dive-in/decision/handler locators fall back to the tree
  index or the GitLab search page.
- **Reading more search pages** (until the exact match is found, or a few pages for the
  callers list) is the next step only if the warning from item 1 is ever seen in a real
  log: every page is another request against the search API's rate limit.
- **MR truncation: a warning is the practical fix, fetching "the rest" is not.**
  Checked against the GitLab docs (2026-10-05):
  - the limit is the instance's diff limits — by default 1000 changed files (configurable
    up to 3000 on self-managed), plus size and line limits; an MR has to be huge to hit it;
  - `GET /merge_requests/:iid/diffs` (paginated, GitLab 15.7+; `/changes` is deprecated
    since 15.7 but still served) is subject to the **same** diff limits — paging does not
    get past the cut;
  - `/changes?access_raw_diffs=true` reads diffs from Gitaly and skips the database-backed
    size limits, but returns the full diff content of every file — a very large response
    for exactly the MRs that need it, while only the paths are used;
  - the repository compare API between the base and head SHAs is an untested alternative.
  Revisit only if a real MR is reported past the limit.
- Places that read a search page: `handler-locator.js` (topic, class),
  `call-activity-locator.js`, `decision-locator.js`, `caller-locator.js`,
  `decision-caller-locator.js`, `correlation-locator.js`. `process-file-index.js` pages the
  repository tree explicitly and is not affected.
- Related: [BUG-0028] (the fallback this came from), [BUG-0013] (search-term shape),
  [FEAT-0027] / `CorrelationLocator`.

## Work log

<!-- Each AI session on the task — a separate entry by the template below.
     Add new entries on top (freshest first). -->

### 2026-10-05 · claude-opus-5-5 · branch `release/v1.3.0`

`GitLabPlatformClient.searchCode` now asks for `per_page=100` (GitLab's maximum) by
default instead of GitLab's 20, so all seven locators get the page `CorrelationLocator`
already requested; still one request per search. Not done: the truncation warnings and the
log review above. Corrected the task's assumptions against the GitLab docs: the MR
`changes` limit is 1000 files by default (not 20), and the paginated `/diffs` endpoint is
capped by the same limits, so it is not a way to fetch the rest.
