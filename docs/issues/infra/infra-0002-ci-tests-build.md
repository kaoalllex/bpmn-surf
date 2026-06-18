---
id: INFRA-0002
title: 'CI: running tests and building the distribution'
priority: medium
status: open
---

## Statement

Using GitLab, run tests and build the distribution on merge into master.

## Context

- Partially: unit tests (`node:test` + `jsdom`) already exist in `test/` (`npm test`). What remains is building the distribution and running it in CI.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
