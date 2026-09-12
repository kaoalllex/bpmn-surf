---
id: INFRA-0008
title: Set up automated in-browser verification (so changes can be verified without manual testing)
priority: medium
status: open
---

## Statement

There are no integration auto-tests and no working path for an AI agent (or CI)
to verify a change by actually running the extension on a GitLab page. Today
verification is fully manual: a human loads the unpacked extension and clicks
through an MR (see `docs/testing.md` "Manual checking"). We want a repeatable,
preferably scriptable way to drive the real extension on a real (or realistic)
GitLab MR and capture the result — so the user does not have to hand-test every
change, and so a `/verify` run can produce replayable evidence.

The goal: a documented, reproducible harness (and ideally a `verifier-*` skill)
that launches Chrome with the unpacked extension loaded, reaches an authenticated
GitLab MR with BPMN/DMN diffs, drives the differ, and captures screenshots /
console output.

## Context

- Surfaced while trying to `/verify` [FEAT-0023] (dive-out navigation) on a real
  internal MR. The attempt was **BLOCKED** by the environment:
  - The `chrome-devtools` MCP controls a **separate** Chrome instance: it came up
    on `about:blank`, **no extension loaded**, profile "managed by your
    organization".
  - Opening an internal MR diffs page redirected to the corporate SSO login
    page — **no authenticated session**, and the interactive SSO login cannot
    be completed by the agent.
- Blockers to solve, roughly in order:
  1. **Extension loading** — launch the MCP-controlled Chrome with the unpacked
     extension from the repo (`--load-extension=<repo>` / a dedicated user-data
     profile), pointed at the working tree so the current branch's code is used
     (and reloaded after edits).
  2. **Authentication** — solved by not needing it: serve the pages and API
     responses from local fixtures through Playwright route interception (see
     the design decisions below) instead of reaching a live, logged-in GitLab.
     Driving a real instance stays an option for higher fidelity, and then needs
     a session the agent cannot obtain on its own.
  3. **Driving + capture** — a `verifier-bpmn-diff` skill (or a script) that opens
     an MR, clicks "Show schema diff", drives the differ (dive in/out, search,
     switch branch), and captures screenshots + console.
- Decide scope: local-only agent verification vs. CI smoke test (headless Chrome
  + a fixture GitLab, or a recorded/mocked GitLab API). Mocking the GitLab API
  responses may be simpler and hermetic than driving a live instance.
- Note the constraint: MCP servers are **local only** (stdio); no remote MCP.
- Related: `docs/testing.md` (manual checking section to be updated once a
  harness exists); the unit-test harness `test/support/scope.js` is unaffected.

## Design decisions for Layer 3

Settled while designing the three-layer test architecture (2026-06-25); Layers 1
and 2 shipped, Layer 3 is what remains of that design and is this task. The layer
table lives in `docs/testing.md`.

- **Runner: `@playwright/test`**, already a dev dependency — it loads an MV3
  extension, intercepts network, and produces trace/screenshot/HTML artifacts.
  Layer 3 specs live alongside the Layer-2 ones in `test/e2e/`.
- **Extension loading:** a persistent context with `--load-extension=<repo root>`
  (the repo root *is* the unpacked extension — the manifest sits at the root), on
  a dedicated user-data profile.
- **Backend: route interception from local fixtures**, not a live GitLab. Fulfil
  the MR page HTML, `/api/v4/...` JSON, `/-/raw/...` XML, search and `/changes`
  from captured files. This removes the authentication blocker above entirely.
- **Page fixtures: synthetic GitLab-shaped pages by default.** Button injection
  keys off a handful of container selectors only (`GitLabDomScraper`,
  `GitLabUIRepoProvider`: `[data-path]`, `.is-active`, `<diff-file>`, the ref
  selector, `.merge-request-sticky-header-wrapper`), and the provider unit tests
  already build GitLab DOM by hand. Synthetic fixtures are fully offline and need
  no human in the loop.
- **Captured real pages are the optional higher-fidelity path**, only if a
  regression ever depends on real GitLab markup. API/raw/search JSON can be
  captured by an agent with a PAT; rendered page HTML needs a one-time
  interactive capture by the human. Markup drift is accepted — recapture on
  redesign.
- **Not part of `npm test`.** `npm run test:e2e` runs on demand and before
  merging; the unit loop stays fast.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries at the top (most recent first). -->
