---
id: INFRA-0014
title: GitHub parity in the live and Layer-2 checks; a faster live check
priority: medium
status: open
---

## Statement

The GitHub side of the extension is checked much more thinly than the GitLab side,
and the live check as a whole is slow. Close the three GitHub gaps and cut the
release smoke's wall time.

1. **A live runner for the PR buttons.** `mr-button.mjs` asserts, per MR and per UI,
   one button per diagram block, none on code, no churn, the differ opening with the
   right sides. GitHub has no twin: the buttons on a PR's Files changed (both UIs),
   soft navigation, the commit and range views are walked by hand from
   `catalog/github.md`. Add `pr-button.mjs` (same contract and output as
   `mr-button.mjs`: `RESULT: OK` / `FAIL` lines, `--click`, `--scroll`, `--shots`) so
   release-smoke step 6 becomes mostly automated; what stays by hand is what cannot be
   driven (anonymous vs signed-in comparison may be scripted with
   `BPMN_SURF_ANONYMOUS=1`, the private repository, Chrome's permission dialog).
2. **Captured GitHub markup.** The GitHub provider's unit tests run on hand-saved HTML
   (`test/fixtures/github/`). `capture-markup.mjs` re-captures GitLab's markup, so a
   GitLab layout change turns those unit tests red; nothing does that for GitHub.
   Teach `capture-markup.mjs` (or a GitHub sibling) to capture a PR's Files changed in
   the new and the classic UI and a blob header.
3. **Layer-2 navigation on GitHub.** The differ's navigation through
   `GitHubPlatformClient` — handler and listener badges, dive-in, callers, correlation,
   changed-in-PR handlers, the `#diff-<sha256>` links — has 4 Layer-2 specs
   (`differ-github-navigation`, `differ-github-search`) against about 20 on GitLab's
   mocked search. Mirror the GitLab badge / dive-in / callers / correlation specs on
   GitHub's search and file-list fixtures.
4. **A faster live check.** The 1.4.0 release smoke took most of a working session.
   Measure first (a per-script timing line), then cut. Observed so far:
   - every script launches its own Chromium on the shared profile and re-stages the
     extension (a copy of `src/` and `libs/`, ~3.5 MB) and waits for its content
     scripts — a smoke run does that 30+ times;
   - fixed sleeps add up: `mr-button.mjs` sleeps ~20 s per run (×~20 runs in a smoke),
     `branch-button.mjs` 9 s, `file-selection.mjs` 11.5 s, `openDiffer` 3 s per differ;
     most can wait on a condition instead;
   - the profile lock forces one script at a time; several cells could run as tabs of
     one browser instead (a `smoke.mjs` that walks the whole release list in one
     context, with a summary table at the end);
   - `record-demo.mjs --no-video` (~6 min) and the `badges.mjs` rows overlap on the
     demo's navigation: decide which one the smoke needs.

## Context

- Surfaced by the 1.4.0 release smoke (branch `release/v1.4.0`): only GitHub's badge
  rows were run, the rest of `catalog/github.md` was skipped; a `page.goto` timeout on
  github.com needed a re-run.
- The owner's framing: the differ itself is shared, so it is tested once; per platform
  what matters is the buttons on its pages and the differ's navigation through its
  platform client (`src/differ/platform/`).
- Files: `test/e2e/live/` (`mr-button.mjs`, `capture-markup.mjs`, `support.mjs`,
  `README.md`), `.claude/skills/live-check/` (`SKILL.md`, `catalog/github.md`),
  `test/e2e/differ-github-*.spec.js`, `test/fixtures/github/`, `docs/testing.md`.
- Related: [INFRA-0008] (the live harness itself), [REFAC-0004] (GitHub support).

## Work log
