---
id: FEAT-0002
title: Diff for an already-merged MR
priority: high
status: done
---

## Statement

Find the schema commits/versions after the merge and build a diff without an open active MR.

## Context

Delivered incidentally by the MR commit-resolution machinery rather than as a dedicated change. Two independent paths cover the scenario:

- **API path** ([REFAC-0001]) — `GitLabApiRepoProvider` reads `diff_refs.head_sha` / `diff_refs.base_sha` from a single `GET /merge_requests/:iid` call. GitLab returns `diff_refs` identically for `opened` and `merged` MRs, so the diff is built from fixed SHAs and never depends on MR state or on the source branch still existing.
- **Heuristic fallback path** — `MergedMrCommitResolver` (`src/content/providers/gitlab/merged-mr-commit-resolver.js`) detects the merge (merged badge, or `merged_at` / `state === 'merged'`) and reconstructs the target commit from the target-branch history / atom feed by MR title. Used only when the API path is unavailable.

Related: [REFAC-0001], [FEAT-0001].

## Work log

### 2026-06-22 · claude-opus-4-8 · branch `master` (docs-only)

Analysis only — no code change needed; the feature is already implemented. Verified by code and tests:
- `src/content/providers/gitlab/gitlab-api-repo-provider.js` resolves source/target from `diff_refs` regardless of MR state — covered by `test/content/providers/gitlab/gitlab-api-repo-provider.test.js` ("maps the same diff_refs fields for a merged MR", with a `state: 'merged'` fixture).
- `src/content/providers/gitlab/merged-mr-commit-resolver.js` handles the merged case on the heuristic fallback — covered by `test/content/providers/gitlab/merged-mr-commit-resolver.test.js` (merged via badge / via API).

Closed as `done`; moved to `archive/features/`. Not exercised live in a browser on a real merged MR — left to a manual `/verify` pass if 100% confidence is wanted.
