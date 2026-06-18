---
id: BUG-0016
title: The handler navigation badge is duplicated on an element with an external label
priority: medium
status: done
---

## Statement

On an element whose handler is touched in the current MR (a permanent colored
`</>` badge), the badge is displayed **twice** if the element has an external
label. Discovered on `OrderScoringRejectReasonTask` (the handler was added
in the MR). It should be shown once.

## Context

### Root cause

bpmn-js stores an element's external label as a **separate registry element**
(`<id>_label`) with the same `businessObject` as the host element (the field
`labelTarget` points to the host). `HandlerNavigator.refreshChangedBadges` iterates over
**all** elements of `elementRegistry.getAll()` and for each calls `#getHandlerKey`.
The label returns the same handler key as the host → the permanent badge is added
both to the host and to its label. Diagnostics on the differ page:

```js
[...document.querySelectorAll('.handler-link')]
  .map(el => el.closest('.djs-overlays')?.getAttribute('data-container-id'))
// → ['OrderScoringRejectReasonTask', 'OrderScoringRejectReasonTask_label', ...]
```

The selection-based badge path did not suffer from this: it already normalizes the id
(`elemId.replace(/_label$/, "")` in `#onSelectedElementChanged`) and takes the host element.
That's why the bug is visible only for handlers touched in the MR (permanent badges), and not
on simple viewing/selection.

External labels in bpmn-js are received by `Event | Gateway | DataStore/DataObjectReference |
DataInput/Output | SequenceFlow | MessageFlow | Group`; ordinary tasks have no label
(the name is inside the shape), which is why the bug didn't affect most service tasks. Affected is
any element with an external label — including message events from [FEAT-0018].

### Solution

In `HandlerNavigator.#getHandlerKey`, return `null` for label elements
(`elem.labelTarget` is set) — so that both badge-adding paths (permanent and
by selection) equally ignore labels. A minimal edit in a single point,
reused by both paths.

### Affected files

- `src/differ/navigation/handler-navigator.js` — a gate on `elem.labelTarget` in `#getHandlerKey`.
- `test/support/scope.js` — `HandlerNavigator` added to the harness (was uncovered).
- `test/structure/source-layout.test.js` — removed from `UNTESTED_BY_DESIGN`.
- `test/differ/navigation/handler-navigator.test.js` — regression tests for `refreshChangedBadges`.

### Relations

- [FEAT-0018] — discovered while checking the badge on message events; the fix matters for them too
  (events always have an external label).
- [FEAT-0003], [FEAT-0004] — the handler badge mechanism.

## Work log

### 2026-06-18 · claude-opus-4-8 · branch `feature/feat-0018-handler-badge-message-event`

The root cause was localized (a label element shares the `businessObject` with the host; the permanent
badge was added by both). Fix — a gate on `elem.labelTarget` in `#getHandlerKey`.
`HandlerNavigator` was added to the test harness, 4 regression tests for
`refreshChangedBadges` were added (host+label → one badge; message event+label → one;
two different hosts with one handler → two, without false dedup; no changes → zero).
Without the fix, 2 of 4 fail; with the fix — all pass. `npm test` green (782 tests).
