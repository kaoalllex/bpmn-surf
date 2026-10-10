---
id: INFRA-0013
title: record-demo.mjs — the "diagrams" tour times out on the changed-handler step
priority: low
status: open
---

## Statement

`node test/e2e/live/record-demo.mjs <iid> <dir> --no-video --clip diagrams` on the demo
project fails at `record-demo.mjs:384`: after clicking the changed `ChargeCustomer` handler
badge in the Payment differ, `mrLands` waits for the MR tab's URL to change and times out
(`page.waitForURL: Timeout 30000ms`). The MR tab does show `ChargeCustomerHandler.kt`'s diff
(screenshot `failed-diagrams-1.png`), so the extension works; the wait does not.

## Context

Reproduced on `master` (`b6cbbd7`) and on `feature/camunda-dialects-listener-badges`,
2026-10-10, the run alone or after the other tours — not a regression of that branch. Likely
cause: the MR tab already sits on that file's anchor, or GitLab now selects the file without a
URL change, so `mr.url()` never differs from `before`. A fix probably waits for the file block
to be on screen instead of a URL change. It blocks re-recording the `diagrams` GIF and the
release smoke's step 5 (`live-check` skill).

## Work log

<!-- Each AI session on the task — a separate entry by the template in docs/issues/README.md.
     Add new entries on top (freshest first). -->
