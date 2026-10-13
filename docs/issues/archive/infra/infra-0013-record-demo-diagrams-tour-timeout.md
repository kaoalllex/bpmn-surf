---
id: INFRA-0013
title: record-demo.mjs — the "diagrams" tour times out on the changed-handler step
priority: low
status: done
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

### 2026-10-13 · claude-opus-5-5 · branch `fix/infra-0013-record-demo-handler-wait`

Not the script: an extension regression, unreleased (since `d533870`, FEAT-0038, after
1.3.0). That change made `openDiffer` rewrite the new tab with `document.open()`, which by
the HTML spec gives the about:blank tab the URL of the page that opened it. So
`DifferTabNavigator#isDifferTab` (`location.href === 'about:blank'`) no longer recognised a
parent differ, and a changed-handler badge in a dived-into differ navigated the parent
diagram's tab to the MR file instead of the MR tab (BUG-0047 again); the MR tab's URL never
changed, hence the timeout. Fix: a differ tab is recognised by the registry name every differ
takes (`TAB_NAME_PREFIX`); the unit test's parent differ now carries the MR URL as it does
live. Live: `record-demo.mjs 1 … --no-video --clip diagrams,code` → both OK; `npm test`
and the handler/listener badge e2e specs green. `record-demo.mjs` itself is unchanged.
