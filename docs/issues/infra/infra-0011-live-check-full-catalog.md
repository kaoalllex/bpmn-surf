---
id: INFRA-0011
title: Extend the live-check skill's catalog to the whole extension
priority: medium
status: in-progress
---

## Statement

The `live-check` project skill (`.claude/skills/live-check/SKILL.md`) lets any
session run a hands-on check of the real extension on the sandbox. Its catalog
covers only some areas (one file per area in `.claude/skills/live-check/catalog/`, indexed
from the skill's "Catalog" table). Add the other areas, each as its own file there, with:
- concrete steps;
- the sandbox material it needs, created through the API;
- what the harness can assert and what has to be eyeballed from screenshots;
- which dialect's material it runs on. Camunda 7 is the baseline and gets no file of its
  own (`camunda8.md` is the C8 delta): its specific expectations go into the area files.

The areas to add:
- differ highlighting (BPMN and DMN);
- the changes table;
- the properties panel — for Camunda 7 the C7 groups (external task topic, listeners,
  I/O), next to the Zeebe groups `camunda8.md` already checks;
- switch branch;
- navigation — partly covered: "Differ navigation" (`record-demo.mjs --no-video` on the
  demo project) walks dive-in, back to the parent, the callers list, the decision
  badge, handler and correlation badges. Not yet: opening a caller from that list (the
  call site selected), and the sandbox's traps (prefix topics, duplicate classes,
  no-code topics), and the C7 handler badges themselves (`camunda:topic` →
  `@ExternalTaskSubscription` on `order-service/`);
- search;
- edit mode;
- the popup (hosts, settings);
- report-a-problem.

## Context

- Created alongside the per-file diff button work (branch
  `fix/per-file-diff-button`), where the skill and its first area were written.
- The harness scripts live in `test/e2e/live/`. Offline differ checks already
  exist as Layer-2 specs (`docs/testing.md`). The catalog should point to those
  instead of duplicating them, and keep to what only a live run shows.
- The skill now routes differ-only changes to the Layer-2 specs (they run the real
  bpmn-js and properties panel offline), so for the differ areas above a live entry
  should only cover what reaches GitLab at run time: file fetching, blob search
  (handler badges, correlation), the dive-in file lookup, switch branch.
- Related: [INFRA-0008] (automated Layer-3 e2e), which would move part of this
  into CI.

### Gaps found by the 2026-10-11 audit

The live catalog was checked feature by feature (README "Features") against C7 and C8.
Only what reaches GitLab/GitHub at run time is listed; differ-only areas are Layer-2.

- **Correlation badge.** C8: no scenario at all (`AwaitPayment` → `OrderPaidC8` →
  `PaymentEventsListener.kt`). C7: only `AwaitPayment` on the demo project; the constant
  case (`Messages.kt`, Phase 2), the hidden tests group and the config group are unchecked.
  No C7 ↔ C8 isolation row for **messages** (there is one for topics) — which is how
  `OrderPaid` matching `OrderPaidC8` reached review (fixed in `827a63c`, unit-tested).
- **Listener badges (FEAT-0019).** C8: one scenario. C7: none, and the sandbox has no C7
  diagram with listeners (`camunda:executionListener` class / delegateExpression /
  expression, `camunda:taskListener`) — the material must be added through the API.
- **C7 handler badges.** Only three demo tasks; the sandbox's traps (prefix topics
  `findItems` / `chargeCustomer`, `RefundDelegate` in two packages, `camunda:class`,
  `camunda:delegateExpression`, `${billingService.settle(execution)}`, the
  `migrationStep01…30` topics without code) are unchecked. C8 has all of its traps.
- **Callers list, C7.** Listed on the demo, but opening a caller (call site selected) is not
  checked; C8 checks it.
- **Buttons.** `buttons.md` names no material (C7 by default); the blob button on a C8
  file is not checked (a transient `Cannot find button parent container` error on
  `order-service-c8/.../OrderMain.bpmn` was logged as an error until `9561f03`). The
  GitLab "commit vs. its parent" diff has no row (GitHub has one). "Diff with local
  file…" is checked only up to the menu opening.
- **GitHub × C8.** Only the release-smoke line "camunda8.md on GitLab and on GitHub"; no
  row of its own.
- **Not live at all:** report-a-problem (💬) on a real page, the popup outside the offline
  screenshots.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-10-11 · claude-opus-5-5 · branch `feature/camunda-dialects-listener-badges`

Audited the live catalog against the full feature list for C7 and C8 after a review
found a C7/C8 cross-match in the correlation search that no live row covered; the
findings are in "Gaps found by the 2026-10-11 audit" above. Nothing added to the catalog
yet. Next step: a wider audit of unit, Layer-2 and live coverage together (move into
unit/Layer-2 whatever can be covered there reliably; live stays the final check).

### 2026-10-10 · claude-opus-5-5 · branch `fix/live-check-c7-baseline`

The catalog was split into per-area files (`catalog/`). Made explicit that Camunda 7 is the
baseline dialect (the skill's "Catalog" intro); added the C7-specific checks to the areas
above (properties panel, handler badges) and the dialect requirement for new area files.

### 2026-10-05 · claude-opus-5-5 · branch `release/v1.3.0`

`record-demo.mjs --no-video` walks the demo tours without recording, and the skill
gained a "Differ navigation" section (signed in: code search is mocked offline) and a
"Release smoke" set run before every release and store submission; `/release` points
to it. The navigation area is partly covered by that; the rest is listed above.

### 2026-09-27 · claude-opus-5-5 · branch `fix/loop-characteristics-panel-highlight`

Reviewed the skill on a differ-only fix (BUG-0042): the catalog had nothing for it and
no pointer to where such a change is checked. Added the "does this change need a live
run?" routing section; the change itself was verified by a new Layer-2 case in
`differ-edit-prop-group.spec.js`. The catalog is still buttons-only.
