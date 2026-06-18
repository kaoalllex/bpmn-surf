---
id: REFAC-0004
title: Code-hosting platform abstraction → GitHub support
priority: low
status: open
---

## Statement

Introduce a code-hosting platform abstraction to enable subsequent GitHub support.

## Context

Introduce an interface on top of GitLab (`GitLabRepositoryProvider` / `GitHubRepositoryProvider`), extract the GitLab-specific parts, and define extension points. A target task for after the Open Source release.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
