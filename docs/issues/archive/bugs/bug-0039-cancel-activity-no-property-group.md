---
id: BUG-0039
title: cancelActivity change on a boundary event highlights nothing in the panel
priority: medium
status: done
---

## Statement

Toggling a boundary event's `cancelActivity` (interrupting <-> non-interrupting)
correctly marks the element as changed on the canvas, but the properties panel shows
nothing: no group is highlighted, so there is no indication of what changed. The panel
does change its header text ("Timer boundary event" -> "Timer boundary event (non
interrupting)"), which is what should be painted instead.

## Context

Found while reviewing [bpmn-surf-test MR !12](https://gitlab.com/kao.alllex/bpmn-surf-test/-/merge_requests/12/diffs):
`order-service/.../Delivery.bpmn`, element `CourierTimeout`. `BpmnXmlComparator`
detects the `cancelActivity` attribute diff, but `#DIFF_TO_PROPERTY_GROUP_MAP` has no
entry for it, so `#findDiffPropertyGroup` returns nothing and the diff is silently
dropped (with a `console.warn`). The bio-properties-panel bundle has no field for
`cancelActivity` at all (verified: no "Cancel activity" label string in
`libs/bpmn-js-properties-panel/bpmn-js-properties-panel.umd.js`) — same situation as
`bpmn:startEvent/isInterrupting`, already handled, but that one is dropped silently
(`_ignored_`) rather than pointed at the header.

## Work log

### 2026-09-26 · claude-sonnet-5 · branch `fix/mr-review-differ-issues`

Added a `_header_` marker to `#DIFF_TO_PROPERTY_GROUP_MAP` for
`bpmn:boundaryEvent/cancelActivity`; `BpmnXmlComparator.compare` now routes it into
`typeChangedIds` instead of `nodeIdToDiffsMap`, and `PropertiesPanelHighlighter`
paints the panel header the same way it already does for a type change.
`isInterrupting` is untouched (out of scope — the report was about `cancelActivity`).

Verified against the real MR !12 pair via the `#scope` harness: `CourierTimeout` now
lands in `typeChangedIds`. Unit tests added in
`test/differ/bpmn/bpmn-xml-comparator.test.js`. `npm test` green.

Files: `src/differ/bpmn/bpmn-xml-comparator.js`,
`src/differ/bpmn/properties-panel-highlighter.js`.
