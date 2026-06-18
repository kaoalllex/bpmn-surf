---
id: BUG-0008
title: Check cache invalidation in localStorage
priority: medium
status: done
---

## Statement

There are scenarios where the cache needs to be invalidated — review the caching logic.

## Context

Related to [REFAC-0008] — the `ProcessFileIndex` fallback in `CallActivityLocator`
is planned to be removed after blob-search has been road-tested.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (freshest first). -->

### 2026-06-16 · claude-opus-4-8 · branch `fix/bug-0008-cache-review`

Checked all work with local caches. **There is no real invalidation problem in
localStorage** — both disk caches self-clean:

- `ProcessFileIndex` (`process-file-index.js`): the key contains `latestCommitId`
  (the branch HEAD from the API); when the branch moves, the key changes, and old keys with the same
  prefix are removed.
- `MasterCommitManager` (`master-commit-manager.js`): TTL of 1 hour + a limit of 30 pages.
- `PageReloader`: sessionStorage + an explicit `reset()`.

In-memory caches (`fileCache`, `SingleEntryCache`, locator Maps) are keyed by the
full URL/ref → there is no cross-version contamination. The "a stale cache survives a commit
change" scenario does not reproduce — closing as no longer relevant.

Along the way I did three small things found during the review:

1. **The `ProcessFileIndex` fallback now accounts for the ref.** Previously the index was built
   rigidly with `targetRef`, and `findProcessFileParams()` did not accept a ref — on a
   dive-in from the MR version (where `sourceRef` is shown), the fallback searched for the file in `targetRef`.
   Threaded `ref` through `CallActivityLocator.resolveProcessFile` →
   `findProcessFileParams(processId, ref)`; the index state is now per-ref.
   The localStorage keys for the default ref did not change (backward compatibility).
2. **`fileCache` (`utils.js`) is bounded** to 200 entries with FIFO eviction — it no longer
   grows without bound on a long-lived page.
3. Fixed a misleading comment about the key format in `#getLocalStorageKey`.
