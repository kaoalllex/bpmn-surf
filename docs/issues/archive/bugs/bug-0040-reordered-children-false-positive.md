---
id: BUG-0040
title: Reordered (but unchanged) child elements are reported as a diff
priority: medium
status: done
---

## Statement

An element whose children were merely reordered by the modeler (no content change)
gets painted as changed on the canvas, with nothing shown in the properties panel —
because `BpmnXmlComparator` pairs children **positionally**, so a reorder makes it
compare unrelated tags at the same index and yields an empty-but-truthy diff.

## Context

Found while reviewing [bpmn-surf-test MR !12](https://gitlab.com/kao.alllex/bpmn-surf-test/-/merge_requests/12/diffs):
`order-service/.../Fulfillment.bpmn`, element `AwaitShipment` — only its
`messageEventDefinition` moved from first child to last (a newer Camunda Modeler
save), no semantic change, yet the element was flagged changed.

There is already a fallback for exactly this shape of bug —
`#hasPositionalTagMismatch` + `#findChildrenDiffs`, matching children by markup
regardless of order — but it was wired up **only** for `bpmn:extensionElements`
(where it was added to fix a different, narrower case).

A second, related issue surfaced while testing the fix on `CourierTimeout` in the same
MR (see [BUG-0039]): its `timerEventDefinition` child was also reordered, and the
modeler regenerated its auto id in the process (`TimerDef_1` ->
`TimerEventDefinition_01xjcrh`). The markup-based matching compares raw `outerHTML`,
which includes `id`, so an otherwise byte-for-byte identical child still counted as
"different" — inconsistent with `#getAttributesDiffs`, which already treats an
element's own `id` as non-semantic.

## Work log

### 2026-09-26 · claude-sonnet-5 · branch `fix/mr-review-differ-issues`

- Dropped the `bpmn:extensionElements`-only restriction on the
  `#hasPositionalTagMismatch` fallback in `#compareNodes`: any node with a positional
  tag mismatch now falls back to markup-based (order-independent) child matching.
- Added `#markupIgnoringId`, used only in `#pushOuterDiff`'s matching, stripping
  `id="..."` before comparing — so a child that only had its auto id regenerated is
  no longer reported as different.

Verified against the real MR !12 pair via the `#scope` harness: `AwaitShipment` no
longer appears in `changedShapeIds`; the `CourierTimeout` id-regeneration warning is
gone. Unit tests added in `test/differ/bpmn/bpmn-xml-comparator.test.js`. `npm test`
green.

Files: `src/differ/bpmn/bpmn-xml-comparator.js`.
