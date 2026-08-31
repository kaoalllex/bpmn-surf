---
id: FEAT-0001
title: Diff for a specific commit in an MR
priority: high
status: done
---

## Statement

Currently, for any MR commit the final version of the schema is shown (the latest commit is taken). We need to: compare the schema of the selected commit with the preceding commit of the same MR (and if there is none — with the target branch).

## Context

- Repro: an MR with several commits touching the same schema — select any commit other than
  the last one on the MR diffs page

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-06-16 · claude-opus-4-8 · branch `feature/diff-for-specific-commit`

Implemented in the primary provider `GitLabApiRepoProvider`. When a specific commit is selected in the MR diffs view,
the URL contains `?commit_id=<sha>`; a pure
`GitLabUrlParser.extractCommitId(href)` was added. `getSourceCommitId()`, when `commit_id` is present,
returns the selected commit, `getTargetCommitId()` — its first git parent
(`GET /api/v4/projects/{id}/repository/commits/{sha}` → `parent_ids[0]`, cached by sha).
This exactly reproduces GitLab's single diff; for the first commit of the MR the parent = the branch-off point
on the target branch, so the case "no preceding commit → target branch" works out
by itself. Fallback to `diff_refs.base_sha` if there is no parent (root commit) or the request
failed. The DOM-heuristic `GitLabRepoProvider` (doomed fallback, REFAC-0001) is not
supported — a known limitation. Unit tests: `extractCommitId` (parser) and the scenarios of the
selected commit in the API provider.
