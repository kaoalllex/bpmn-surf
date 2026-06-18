---
id: REFAC-0003
title: Extract a separate cache manager
priority: low
status: done
---

## Statement

Extract a separate cache manager.

## Context

- Possible follow-up: move the `init` and `initChangeInfo` caches onto `SingleEntryCache`.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (freshest first). -->

### 2026-06-11 · — · (branch `fix/backlog-autonomous-fixes`)

The `getTargetCommitId` cache was extracted into the `SingleEntryCache` class (in the same `gitlab-repo-provider.js` — a new file would have required editing `manifest.json`).
