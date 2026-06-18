---
id: REFAC-0001
title: Fetch parameters via the GitLab MR API; improve commit hash lookup
priority: high
status: done
---

## Statement

Fetch merge request parameters via `GET /api/v4/projects/{project}/merge_requests/{mr}/` instead of parsing them from HTML and using heuristics. Make commit lookup more reliable (fewer cases of "the diff failed to build because of a wrong commit").

## Context

Many things are currently parsed from HTML or picked up via heuristics — switch to the MR API.

- To rework: `getMrCommitId`, `getMrSourceAndTargetBranchName`, `getTargetCommitId` (in the current code — `getSourceCommitId`, `getChangeBranchNames`, `getTargetCommitId` in `gitlab-repo-provider.js`).

### Accepted design (preparation done, see Work log)

The switch to the API is conceived as a **separate implementation of the `RepoProvider` interface**, while the DOM/heuristic path remains a **fallback** (until the API is debugged, after which it is to be removed entirely):

- **Whole-provider fallback.** `FallbackRepoProvider` (`fallback-repo-provider.js`) holds an ordered list of implementations and on `init()` picks the first one that is available and initializes successfully, then delegates all calls to it. Removing the DOM path in the future = drop `GitLabRepoProvider` from the chain in `repo-provider-factory.js` and delete the class.
- **The seam is already in place.** `GitLabApiRepoProvider` (`gitlab-api-repo-provider.js`) sits in the chain **before** `GitLabRepoProvider`, but `isAvailable()` returns `false` and its methods throw "not implemented" → behavior is unchanged.
- **The core is decoupled from GitLab.** `App` works only through neutral interfaces; the `RepoProvider` method names are neutral (`isChangeViewActive`, `initChangeInfo`, `getChangeInfo`, `getChangeBranchNames`, `getSourceCommitId`, `getTargetCommitId`). The differ-page parameters are neutral (`sourceRef`/`targetRef`/`sourceBranchName`/`changeRequestId`) + a `platform` descriptor `{kind,projectUrl,hostUrl,projectId}` (`diff-params-builder.js`, `DifferParams`).

### TODO for the next session (REFAC-0001 proper)

1. Implement `GitLabApiRepoProvider` via `GET /api/v4/projects/{id}/merge_requests/{iid}`:
   - `getSourceCommitId` ← `diff_refs.head_sha`;
   - `getTargetCommitId` ← `diff_refs.base_sha`/`start_sha` (more reliable than the current merged/atom-feed heuristics);
   - `getChangeBranchNames` ← `source_branch`/`target_branch`;
   - `getChangeInfo` (title, iid, state) ← from the same response;
   - `isChangeViewActive` — by URL (as now), or validate via the API.
   - `getProjectInfo`/`init` — reuse the project id resolution.
2. Enable `isAvailable()` and put the provider first (it is already first in `createRepoProvider`).
3. Keep the DOM-based `GitLabRepoProvider` as a fallback; create a separate task to remove it after the API is debugged.
4. Links: `[REFAC-0004]` (full neutralization of the `MergeRequestInfo`/`MergeRequestBranchNames` DTOs and abstraction of the differ-page content loader — there), `[REFAC-0002]` (decomposition — partially advanced by extracting `DiffParamsBuilder`).

### Prompt to start the implementation (new session)

The implementation is better done in a fresh session (clean context; this is a behavioral phase — the `feature` skill, not `refactor`). Prompt draft:

```
Implement REFAC-0001 — the details and the accepted design are already in
docs/issues/refactor/refac-0001-mr-api-params.md (the "TODO for the next session" section).

In short: fill GitLabApiRepoProvider (gitlab-api-repo-provider.js) with resolution
via GET /api/v4/projects/{id}/merge_requests/{iid} and enable it as the primary
in the FallbackRepoProvider chain; keep DOM-GitLabRepoProvider as the fallback.

Before writing code:
1. Study the current GitLabRepoProvider and the MR API response format (diff_refs.head_sha/
   base_sha/start_sha, source_branch/target_branch, title, state).
2. Show a plan: which API fields map to which interface methods, how
   we handle non-merged vs merged MRs, where the DOM fallback kicks in.
3. Check the forks with me (for example, whether to probe MR API availability with a token)
   before implementing.

Unit tests are mandatory: for the mapping of the API response → provider methods (mock the
loading), and do not break the existing ones.
```

Tips: verify against live merged/non-merged MRs (there is a test project `dev.example/bpmn-diff-test` on gitlab.com); the API implementation + enabling it as primary is a single MR; removing the DOM path after debugging is a separate task; do not mix it with `[REFAC-0002]`/`[REFAC-0004]`.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (freshest first). -->

### 2026-06-14 · claude-opus-4-8[1m] · branch `refactor/mr-api-params`

Implementation (behavioral phase). Filled `GitLabApiRepoProvider` (`gitlab-api-repo-provider.js`) with resolution via `GET /api/v4/projects/{id}/merge_requests/{iid}`:
- `getSourceCommitId`←`diff_refs.head_sha`, `getTargetCommitId`←`diff_refs.base_sha` — **uniformly for opened and merged** (confirmed against the live gitlab.com API: for both types `diff_refs` is returned identically and matches what GitLab renders in the Changes tab). The merged-detection heuristics (DOM badge, `commits.json`, atom-feed, `MasterCommitManager`) are no longer used for target.
- `getChangeBranchNames`←`source_branch`/`target_branch`; `initChangeInfo` fills `iid`/`title`; the URL is built from the numeric `projectInfo.id`. A single request with a cache.
- `extends GitLabRepoProvider`: the DOM/URL detection methods (file selection, branch-view, project id resolution, `isChangeViewActive`) are inherited.
- Enabled as primary: on an MR page `init()` tries the API and, if `diff_refs` is missing/an error occurs, returns `false` → `FallbackRepoProvider` falls back to the DOM-based `GitLabRepoProvider`. **There is no per-method fallback** (by decision: the goal is to move fully to the API).

Decisions (forks with the user): target = `diff_refs.base_sha` (more accurate for an opened MR — the merge-base instead of the HEAD of the target branch, as GitLab itself does); the fallback is only coarse, at the chain level.

Tests: the new `test/gitlab-api-repo-provider.test.js` (API fields→methods mapping, cache, URL building, missing `diff_refs`); the "seam" block was removed from `test/fallback-repo-provider.test.js`; `test/support/scope.js` — optional `url` in `createScope`. 195 tests green in total.

Remaining/links: verification against `gitlab.example.com` (confirm `diff_refs` is present — a standard field); removal of the DOM commit-resolution heuristics (`#getMrLastCommitId`/`commits.json`, `#isMrMerged`, `#findTargetBranchPreviousCommitId`/atom-feed, `MasterCommitManager`) after the API is field-tested — `[REFAC-0008]`; DTO neutralization — `[REFAC-0004]`.

### 2026-06-14 · claude-opus-4-8 · branch `refactor/platform-abstraction-seams`

Preparation for the task (behavior-preserving, without changing the data source; all 187 unit tests green). Three steps:
1. Provider-selection seam: `repo-provider-factory.js` (`createRepoProvider`/`createUIRepoProvider`), DI into `App`, `FallbackRepoProvider` (whole-provider fallback), the `GitLabApiRepoProvider` skeleton.
2. A neutral vocabulary of differ-page parameters + a `platform` descriptor; `DiffParamsBuilder` extracted; `DifferParams` and consumers switched to neutral names; the nested Call Activity differ — via `DifferParams.toNestedDifferParams`.
3. Neutral `RepoProvider` method names (the change-request vocabulary).

New tests: `test/fallback-repo-provider.test.js`, `test/diff-params-builder.test.js`; `test/differ-params.test.js` updated. Remaining — the `GitLabApiRepoProvider` implementation via the MR API (see TODO above).
