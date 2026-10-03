---
id: INFRA-0002
title: 'CI: running tests and building the distribution'
priority: medium
status: done
---

## Statement

Run the tests and build the distribution on GitHub Actions, on every pull request and on merge into master.

**Scope narrowed: CI runs the tests only.** No zip/package step: a release zip is built from a
tagged master by hand and attached with `gh release create` (see `docs/git-workflow.md`,
"Releases"), and an untagged per-PR zip would be an artifact nobody downloads. Automating the
release upload, if ever wanted, is a separate task.

## Context

- Partially: unit tests (`node:test` + `jsdom`) already exist in `test/` (`npm test`), and the
  distribution zip is built by `npm run package` ([INFRA-0005]). What remains is the workflow
  itself: `.github/workflows/`, running `npm test` on PRs, and attaching the zip to a release.
- The e2e suite (`npm run test:e2e`, Playwright) is deliberately not part of the fast loop —
  decide whether CI runs it on PRs or only before a release. Decided: Layer 2 runs on every PR
  (offline, own static server, ~25 s).
- The live harness (`test/e2e/live/`) never runs in CI: it needs a signed-in GitLab.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-10-03 · claude-opus-5-5 · branch `feature/ci-tests`

Added `.github/workflows/test.yml`: on PRs into master and pushes to master, per-ref concurrency
with cancel-in-progress; Node LTS (no `.nvmrc`/`engines`) with the npm cache; `npm ci`,
`npm test`, then `npm run test:e2e` with only Chromium installed and the browsers cached by the
installed Playwright version; `playwright-report/` uploaded on failure (7 days); no retries.
Docs: `docs/testing.md` (CI + the local command), `docs/git-workflow.md` (green CI before merge).
Making the check required is a repository setting, left to the maintainer.
