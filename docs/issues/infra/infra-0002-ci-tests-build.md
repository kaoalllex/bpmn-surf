---
id: INFRA-0002
title: 'CI: running tests and building the distribution'
priority: medium
status: open
---

## Statement

Run the tests and build the distribution on GitHub Actions, on every pull request and on merge into master.

## Context

- Partially: unit tests (`node:test` + `jsdom`) already exist in `test/` (`npm test`), and the
  distribution zip is built by `npm run package` ([INFRA-0005]). What remains is the workflow
  itself: `.github/workflows/`, running `npm test` on PRs, and attaching the zip to a release.
- The e2e suite (`npm run test:e2e`, Playwright) is deliberately not part of the fast loop —
  decide whether CI runs it on PRs or only before a release.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
