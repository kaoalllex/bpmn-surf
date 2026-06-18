---
id: PERF-0001
title: Reduce network interaction
priority: medium
status: open
---

## Statement

Eliminate unnecessary requests to GitLab; load only what is needed; minimize downloading of file contents and commit history.

## Context

- Lazy paginated loading in `#getProjectId` (currently a single request with `per_page=100`). Code: `gitlab-repo-provider.js#getProjectId`.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
