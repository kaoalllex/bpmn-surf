---
id: BUG-0032
title: Merged-MR target commit is searched in a hardcoded `master`, not the MR's target branch
priority: medium
status: open
---

## Statement

For a merged MR the target side of the diff is "the commit right before the MR
landed". To find it, the extension scans the commit history of a branch — and that
branch is hardcoded to `master`, not the branch the MR was actually merged into.

It goes wrong whenever the MR's target is not `master`:

- a project whose default branch is `main` — the history of a non-existent `master`
  is scanned, nothing is found;
- an MR merged into `develop` (or any other branch) — `master`'s history is scanned
  instead of `develop`'s.

In both cases the resolver falls back to the target branch **name**, so the diff
compares against the branch's current head instead of the pre-merge state.

The branch is already known exactly: `MergedMrCommitResolver#resolveTargetCommitId`
receives `targetBranchName` and simply does not pass it down. A user-configurable
"main branch" setting would not fix this — projects differ in their default branch,
and an MR can target any branch.

## Context

Hardcoded `master`:

- `src/core/config.js` — `MASTER_BRANCH_NAME`, used only in
  `src/content/providers/gitlab/merged-mr-commit-resolver.js#loadFilteredEntries`
  (atom feed filtered by MR title);
- `src/content/providers/gitlab/master-commit-manager.js` — a literal `'master'` in
  the commits atom-feed URL (`/-/commits/master?format=atom...`).

Expected fix:

- pass `targetBranchName` into the title search and into `MasterCommitManager`
  (constructed per project in `gitlab-repo-provider.js`);
- add the branch to `MasterCommitManager`'s `localStorage` cache key — it is keyed by
  project id only, so two target branches of one project would share a cache;
- delete `MASTER_BRANCH_NAME` from `config.js` and its mention in
  `docs/architecture.md` (key-files table).

Not affected: `'master|develop|…'` in `gitlab-url-parser.js` — part of a URL regex
that also has a catch-all branch pattern.

Found while designing [FEAT-0033] (the question was whether the main branch should
become a user setting — it should not).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
