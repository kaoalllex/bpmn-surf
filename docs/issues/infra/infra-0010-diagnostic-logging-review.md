---
id: INFRA-0010
title: Warn on truncated API results and review whether the logs identify user problems
priority: medium
status: open
---

## Statement

Two related pieces of work on diagnosability — the console log a user sends with a bug
report should be enough to identify the cause without a guessing round-trip:

1. **Warn when a result set may be truncated.** Every call that can hit an API page
   limit should say so when the returned count equals the limit, because from that
   moment on "not found" and "found the wrong one" become indistinguishable from
   "was not in the page".
2. **Review the logging as a whole.** Go over the differ page and the content scripts
   and judge whether the current `console.debug`/`warn` lines let us pinpoint a failure
   from the log alone; add what is missing, drop what is noise.

## Context

- Origin: the [BUG-0028] investigation. The user's log showed the search URL and nothing
  else — not which candidates came back, not why one of them was picked — so identifying
  the cause needed the raw GitLab payload and a local re-run. The fallback warning added
  in `50903cd` is the pattern to generalise.
- Places that can silently truncate:

  | Call | Limit |
  |------|-------|
  | `handler-locator.js:412` (topic), `:470` (class) | GitLab default `per_page=20` |
  | `call-activity-locator.js:111`, `decision-locator.js:97` | same default |
  | `caller-locator.js:70`, `decision-caller-locator.js:70` | same default |
  | `correlation-locator.js:426` | asks for `per_page=100`, but never notices hitting it |
  | `process-file-index.js:133` | paginates the repository tree explicitly (`page=`) |
  | `gitlab-platform-client.js:69` (MR `changes`) | GitLab truncates large MRs and signals it in the response — see below |

- The shape of the warning: the term searched, how many hits came back, and the limit —
  enough for the next reader of the log to suspect truncation without re-running anything.
  `console.warn` is timestamped on the differ page (`ConsoleLog.install` (was `utils.js#appendTimeToConsoleLogs`)),
  so it lands in what users paste.
- Raising the page size is a separate, evidence-driven decision — see the `per_page` note
  in [BUG-0028]; the warning is what produces that evidence.
- Related: [BUG-0028] (the fallback this came from), [BUG-0013] (search-term shape),
  [FEAT-0027] / `CorrelationLocator` (the existing `perPage` precedent).

### MR changes truncation — warn is not enough, the data must be complete

`prChangedFiles` (`gitlab-platform-client.js:69`) reads `response.changes` and ignores
everything else about the response. GitLab caps how many changed files it returns for a
large MR and reports that it did so (an `overflow` flag; `changes_count` comes back as
`"20+"` rather than a number). Today that signal is dropped on the floor.

The consequence is not cosmetic: `HandlerLocator.findChangedHandlers` scans exactly this
list for changed `.kt`/`.java` files, so on a truncated MR the changed handlers that fell
off the end simply get **no badge** — the differ looks correct while quietly showing less
than it should.

So here a warning is only the fallback: the fix is to fetch the rest. Options, in the
order they should be evaluated:

1. **Paginated diffs endpoint** — GitLab has a separate merge-request diffs endpoint that
   supports `page`/`per_page`, which is the natural "load the next page" path; `/changes`
   is the older single-shot form.
2. **Ask for the untruncated response** on the existing endpoint (a parameter exists for
   reading the raw diffs), if pagination turns out not to be available.
3. **Warn** with the MR id and the returned count when neither applies, so a missing badge
   is at least explainable from the log.

⚠️ The exact field, parameter and endpoint names, and which of them exist at all, depend
on the version of the self-managed instance and could not be checked from the machine this
task was written on (no GitLab access, and the public docs page did not render the relevant
sections). Confirm against the instance's own `/help` API docs before implementing.

## Work log

<!-- Each AI session on the task — a separate entry by the template below.
     Add new entries on top (freshest first). -->
