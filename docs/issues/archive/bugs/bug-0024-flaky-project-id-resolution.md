---
id: BUG-0024
title: Flaky "cannot get project id" — project resolved via unstable search lookup
priority: medium
status: done
---

## Statement

The extension's error list fills up with repeated, paired `cannot get project id`
warnings on a GitLab MR page, **appearing even while the user is idle** (no
interaction with the page).

Reported observation: open an MR, work for a while → fine; leave the tab idle for
a few minutes → pairs of warnings appear at intervals (e.g. 19:33:52 ×2,
19:33:55 ×2) for `self-service/namespaces/-/merge_requests/116117`.

The Chrome error entry's stack trace is misleading:

```
src/core/utils.js:144 (apply)
src/content/providers/gitlab/gitlab-repo-provider-base.js:64 (init)
```

`utils.js:144` is just the `console.warn` Proxy wrapper (`appendTimeToConsoleLogs`)
that prepends a timestamp — not the fault site. The real source is the
`console.warn('cannot get project id')` in `GitLabRepoProviderBase#init`. It is a
**warning, not an exception** (Chrome lists extension `warn`/`error` together).

## Context

### Root cause

Two independent things combine:

1. **Why resolution fails (the actual bug).** `GitLabRepoProviderBase#getProjectId`
   resolved the project via a fuzzy search:

   ```
   GET /api/v4/projects/?simple=true&per_page=100&search=<name>
   ```

   then did a client-side `find(i => i.path_with_namespace === 'group/name')`.
   This is **non-deterministic** on a large GitLab instance: the search result is
   capped at 100 hits ordered instance-wide, so a common project name (here
   `namespaces`) matches many projects and the exact `self-service/namespaces` can
   fall outside the returned page → `find` returns `undefined` → `null` →
   `cannot get project id`. Hence "works one minute, fails the next" within one
   session (a previously cached successful response can also be evicted from the
   200-entry FIFO `fileCache`, forcing a fresh, now-failing lookup).

   Notably, MR-info in the same class is already resolved **deterministically** by
   `GitLabUrlParser.buildMrApiUrl` via `/api/v4/projects/{group}%2F{name}`. Only
   `#getProjectId` was left on the fragile `search`.

2. **Why it spams in the background.** `App#observeDomChanges` (`app.js`) attaches a
   `MutationObserver` to `document.body` (`subtree:true`). A GitLab MR page mutates
   the DOM continuously in the background (pipeline/CI polling, merge-status widget,
   comments, presence). Each batch (300 ms debounce), while the button is absent,
   re-triggers `App#handleStart('after dom change')` → `init()`. The provider chain
   holds two providers (`GitLabApiRepoProvider` + `GitLabRepoProvider`, both extend
   the base), so each failed run emits **two** warnings — hence the pairs. On an MR
   overview page (no `/diffs`) the button never appears, so the observer retriggers
   indefinitely.

#2 keeps invoking #1, and each failed resolution produces a pair of warnings.

### Fix direction

Replace the fragile search in `#getProjectId` with the deterministic direct
endpoint `GET /api/v4/projects/{url-encoded path_with_namespace}` (the same form
`buildMrApiUrl` already uses): one project (or 404) instead of a search page.
`observeDomChanges` is intentional (catches late diff render, see [BUG-0003]) and
is left untouched — once resolution is deterministic, init succeeds on an
accessible project and is cached in `#initCache`, so background runs no longer warn.

### Affected files

- `src/content/providers/gitlab/gitlab-repo-provider-base.js` — `#getProjectId`

### Related tasks

- [BUG-0003] — the `observeDomChanges` retrigger that amplifies the warnings
  (intended behaviour; not changed here).

## Work log

<!-- newest first -->

### 2026-06-22 · claude-opus-4-8 · branch `fix/project-id-deterministic-resolution`

Rewrote `GitLabRepoProviderBase#getProjectId` to resolve the project id
deterministically via `GET /api/v4/projects/{encodeURIComponent('group/name')}`
instead of `search=<name>&per_page=100` + a client-side `path_with_namespace`
find. The search was capped at 100 instance-wide-ordered hits, so the exact
project could flakily fall outside the page → `null` → `cannot get project id`,
even mid-session. The direct endpoint hits exactly one project (or 404).

`loadContent` is now called with `throwIf404=false`: a missing/inaccessible
project yields a graceful `null` (warn + `init` false), while transient errors
(500/429/timeout) still throw and are reported by `FallbackRepoProvider`. Kept the
single-level `group/name` path (the parser does not support nested groups; the
user's case is single-level) — no scope creep.

Did **not** touch `App#observeDomChanges` — it is intentional ([BUG-0003]) and
deterministic resolution removes the warning at its source.

Updated `test/content/providers/gitlab/gitlab-repo-provider-base.test.js` to pin
the new mechanism (single-object payload, url-encoded path URL, 404→null→false).
`npm test` green (997 passed).
