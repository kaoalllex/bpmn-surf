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
  2. **Authentication** — reach an authenticated GitLab. Options: reuse an
     existing logged-in profile/cookies; or use the gitlab.com test project
     (`dev.example/bpmn-diff-test`, PAT in `~/.secrets/gitlab-token`, see the
     project memory) which avoids internal SSO. The test project would need
     fixtures with a Call Activity chain (A calls B calls C) for navigation tests.
  3. **Driving + capture** — a `verifier-bpmn-diff` skill (or a script) that opens
     an MR, clicks "Show schema diff", drives the differ (dive in/out, search,
     switch branch), and captures screenshots + console.
- Decide scope: local-only agent verification vs. CI smoke test (headless Chrome
  + a fixture GitLab, or a recorded/mocked GitLab API). Mocking the GitLab API
  responses may be simpler and hermetic than driving a live instance.
- Note the constraint: MCP servers are **local only** (stdio); no remote MCP.
- Related: `docs/testing.md` (manual checking section to be updated once a
  harness exists); the unit-test harness `test/support/scope.js` is unaffected.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries at the top (most recent first). -->
