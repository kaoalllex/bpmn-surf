---
id: FEAT-0009
title: Show the branch name in the Branch field, not the hash
priority: low
status: done
---

## Statement

For a merged MR, the `Branch` field currently displays the commit hash of the target branch. Pass the differ the target branch name as a separate parameter (not the ref/commit).

## Context

- Code: `differ-params.js` — `targetRef` (for a merged MR it holds the commit id, not the branch name) is used both for loading the version and as the branch label in `BranchIndicator`. We need to separate them: a ref for loading and a human-readable target branch name for display. The branch name is available via `RepoProvider.getChangeBranchNames().targetBranchName`.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-06-16 · claude-opus-4-8 · branch `feature/branch-name-not-hash` (refinement 3)

On request: in selected-commit mode the role of a side (original vs my commit) was distinguished only by color. I added the role word to the `BranchIndicator` label — a neutral property of the diff (target="before", source="change"), known by the core itself, no provider needed.
- `BranchIndicator`: target → `Original · <label>` (red), source → `Changed · <label>` (blue). Switched from comparing `textContent` to an explicit `#targetShown` flag. In single-version (branch-view, no source) the prefix is not shown.
- Covered with tests: created `test/differ/shared/branch-indicator.test.js` (role/color/state/commit-labels/branch-view), added `BranchIndicator` to `scope.js`, removed it from `UNTESTED_BY_DESIGN`. `npm test` — 657 green. Docs updated.

### 2026-06-16 · claude-opus-4-8 · branch `feature/branch-name-not-hash` (refinement 2)

On request: for a selected commit the short hash is inconvenient — I replaced it with "commit message + short id", e.g. `TASK-13197: extract offer generation to another schema (d72d870a)`.
- `GitLabApiRepoProvider.getDiffSideLabels` became async: it pulls the commit `title` from the commits API (`#loadCommit`, cached by sha — `Map`; `#loadCommitParentId` was switched to it too, +1 request for the parent). The `#commitLabel` format: `"<title> (<short id>)"`, and when there is no title — the short id. Both sides symmetrically (the selected commit and its parent).
- `app.js` — `await getDiffSideLabels`. The `RepoProvider.getDiffSideLabels` interface is marked as possibly-async.
- Tests: a new case "message + short id" (loader dispatch by sha) and a fallback to the short id without a title. `npm test` — 650 green. Docs updated.

### 2026-06-16 · claude-opus-4-8 · branch `feature/branch-name-not-hash` (refinement)

Accounted for the interaction with FEAT-0001 (diff of a selected MR commit against the parent) and the decoupling of the core from the provider. The first take always labeled the target with the target branch name — but for a selected commit (`?commit_id=`) the target = the parent commit, not the branch, and `master` there is misleading (true only for the first commit of the MR).
- The side labels are formed by the provider itself: the new method `RepoProvider.getDiffSideLabels(sourceRef, targetRef) → {sourceLabel, targetLabel}`. The base (`GitLabRepoProviderBase`) — branch names; `GitLabApiRepoProvider` for a selected commit — short commit ids (`shortenCommitId`, 8 chars); `FallbackRepoProvider` delegates. Only neutral strings go into the differ core — GitLab specifics (commit_id) do not leak past the provider boundary.
- Renamed the differ's param surface to neutral names: `sourceBranchName`/`targetBranchName` → `sourceLabel`/`targetLabel` (`DifferParams`, `DiffParamsBuilder`, `BranchIndicator` + `setBranchName`→`setShownLabel`, both differs, the local file in `gitlab-ui-repo-provider.js`). `MergeRequestBranchNames`/`getChangeBranchNames`/`getTargetCommitId(targetBranchName)`/`merged-mr-commit-resolver` were not touched — there those are really branch names.
- Tests: `shortenCommitId` (utils), `getDiffSideLabels` (whole-MR→branch names, selected commit→short SHA), delegation in Fallback. `npm test` — 649 green. Docs: `architecture.md` (provider interface, builder, BranchIndicator, API provider).

### 2026-06-16 · claude-opus-4-8 · branch `feature/branch-name-not-hash`

Separated the ref for loading and the human-readable target branch name for display.
- `DiffParamsBuilder` / `app.js` — a new parameter `targetBranchName` (from `getChangeBranchNames().targetBranchName`); in branch-mode it falls back to `targetRef` (the ref from the URL is readable anyway).
- `DifferParams` — the field `targetBranchName` with a fallback to `targetRef`; passed through to `toNestedDifferParams`.
- `bpmn-differ.js` / `dmn-differ.js` — `BranchIndicator`, `setBranchName`, the name of the downloaded file and the alert "file is not in the branch" for the target side now use `targetBranchName`; `targetRef` remains for loading versions and resolution (getShownRef, rawFileUrl, ProcessFileIndex).
- Tests: `differ-params.test.js`, `diff-params-builder.test.js` — the separation and the fallback are covered. `npm test` — 643 green.
