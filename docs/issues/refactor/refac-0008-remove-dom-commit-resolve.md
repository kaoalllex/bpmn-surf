---
id: REFAC-0008
title: Remove the DOM heuristics for resolving MR commits after the API has been battle-tested
priority: medium
status: open
---

## Statement

Once resolution via the GitLab MR API (`GitLabApiRepoProvider`, `[REFAC-0001]`) has proven reliable in practice (including on `gitlab.example.com`) — remove the DOM/heuristic path for resolving MR commits, which is currently kept as a fallback.

To be removed (in `gitlab-repo-provider.js`, unless used by branch-view/detection):

- `#getMrLastCommitId` (parsing `commits.json`);
- `#findDiffHeadSha` (regex over `data-noteable-data`);
- `#isMrMerged` (the "Merged" DOM badge + a check via the MR API);
- `#findTargetBranchPreviousCommitId` / `#findTargetBranchCommitIdByTitle` / `#loadFilteredByTitleMasterCommitEntries` (atom feed);
- `master-commit-manager.js` (`MasterCommitManager`) — if it is no longer needed anywhere;
- the old `getSourceCommitId`/`getTargetCommitId`/`initChangeInfo`/`getChangeBranchNames` logic in the DOM provider.

Decide along the way: whether to keep `GitLabRepoProvider` as a whole-provider fallback in `repo-provider-factory.js`, or to collapse it into a single provider (in which case the DOM/URL detection methods inherited by the API provider must be moved into a shared base/helpers: `findSelectedFilePath`, `getBranchFileType`, `extractBranchCommitIdAndFilePath`, `isChangeViewActive`, project id resolution).

## Context

- Originating task: `[REFAC-0001]` (switch to the MR API; the DOM path was deliberately kept as a fallback).
- Not to be confused with `[REFAC-0007]` (removal of the old CallActivity schema resolution — a different mechanism).
- Remove only after real battle-testing of the API in prod; for now `FallbackRepoProvider` keeps the DOM provider as a backup in case the API does not return `diff_refs` on the MR page.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
