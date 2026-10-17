---
id: INFRA-0014
title: GitHub parity in the live and Layer-2 checks; a faster live check
priority: medium
status: done
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

### 2026-10-17 · claude-opus-5-5 · branch `feature/infra-0014-github-live-parity`

All four parts, one commit each (plus the shared waits):

1. `test/e2e/live/pr-button.mjs` — the GitHub twin of `mr-button.mjs`: the same per-block
   contract (`checkBlocks` in `support.mjs`) in the UI the profile gets (new signed in,
   classic anonymous), `--range` (commit and range views, both UIs), `--soft` (from the
   Conversation tab), `--width`, `--scroll`, `--click` (the differ's head side must name
   the head branch or the range's end — a stale payload names another), `--shots`,
   `--project`. Also asserts the button's height (≤ 32 px) and place, and, signed in, no
   `api.github.com/repos/…` request (GitHub's own `/_private/browser/stats` telemetry is
   not ours). Of `catalog/github.md`, the rows marked _(smoke)_ are now scripted; the
   picker switching by click, CSP/`EvalError`, the fork, the private repository and the
   popup rows stay by hand.
2. `capture-markup.mjs --github <number> <blob path>` captures the sandbox PR's Files
   changed in the new UI (payload without diff lines, channels and tokens REDACTED, block
   headers) and the classic one (anonymous), and the blob header at the PR's head branch.
   The hand-saved `pr-changes-new-ui.html`/`pr-files-classic.html` are replaced by
   captures of sandbox #7 (rename, merge base behind main), `blob.html` is new;
   `pr-changes-new-ui-stale.html` stays hand-made. Tests: the scraper on all three, and
   `github-ui-repo-provider.test.js` places the buttons on them.
3. Layer 2 on the real `GitHubPlatformClient` (`test/e2e/support/github-routes.js`):
   `differ-github-badges.spec.js` (unchanged handler → blob at the PR head, miss → search
   page, added/changed/removed handler badges → `#diff-<sha256>`, changed and unchanged
   listener, correlation from the search and from a PR file while the search is rate
   limited), decision dive-in and its miss in `differ-github-search`, the callers list
   (search + the PR's own, the PR's own alone, "Couldn't check…" with the search link) in
   `differ-github-navigation`. 4 → 16 GitHub specs.
4. Measured first (a `TIME:` line per script): launching Chromium and staging the
   extension costs 0.8 s, so the per-script launch was never the problem — the fixed
   sleeps were. `settle()` waits until the blocks are rendered and every diagram block is
   decorated, then 1.5 s quiet; the churn window is 3 s instead of 5. `mr-button --click`
   23 s → 8–11 s; a `badges.mjs` dive-in 30 s → 3 s (the differ tab stays on
   `about:blank`, so the wait for a URL ran out every time); `branch-button` loses its 9 s sleep (4 s a run).
   `smoke.mjs` resolves MRs/PRs by kind from the public APIs, runs the GitLab cells with
   "Show one file at a time" on then off (restored in `finally`), the blob/layout/search
   scripts, the GitHub cells signed in and anonymous, retries a timeout once and prints a
   summary table: 35 cells, all OK, in 6.4 minutes (the 1.4.0 smoke took most of a working session). The release smoke walks the `badges.mjs`
   rows (a decision dive-in row was added); `record-demo.mjs --no-video` is for
   re-recording the media only. `mr-button --file` opens one file (`file_path` + its
   sha1 anchor: the legacy UI ignores `file_path` alone).
   Not done: the cells run one after another, not as parallel tabs — with a 0.8 s launch
   there is little left to win, and parallel cells would share the context-wide
   "new tab" event the `--click` checks wait on. `file-selection.mjs` keeps its sleeps
   (a one-off measurement, not in the smoke).

