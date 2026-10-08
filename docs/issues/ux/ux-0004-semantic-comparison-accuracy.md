---
id: UX-0004
title: Accuracy of semantic comparison and property highlighting
priority: high
status: partial
---

## Statement

Eliminate accumulated comparator edge cases:

- ~~Highlight a change of the error code (`bpmn:error`): currently the change is not highlighted.~~ Done.
- ~~`failedJobRetryTimeCycle` belongs to two groups, one is supported (the mapping of `camunda:failedJobRetryTimeCycle` to `Multi-instance` is commented out).~~ Done.
- ~~Pick the correct property panel group title for `bpmn:startEvent/isInterrupting`.~~ Done (header highlight).
- Compare DMN outputs by id, not by label — currently by label, because there is no id attribute on outputs in the html.

## Context

- Change of the error code (`bpmn:error`): seen on an MR that changed a task's error code and
  got no highlight in the diff. Code: `bpmn-xml-comparator.js` (property mapping → group `Error`).
- `failedJobRetryTimeCycle`: code `bpmn-xml-comparator.js`.
- Group title for `bpmn:startEvent/isInterrupting`: code `bpmn-xml-comparator.js`.
- DMN outputs by id instead of label: code `dmn-xml-comparator.js#compareOutputs`.

### Remaining: DMN outputs by id (blocked by the dmn-js markup)

The comparator already *matches* outputs by id; only the result it hands to
`DmnDiffPainter#paintOutputDiffs` is a list of labels, because the painter has nothing
else to find the header cell by. In dmn-js 17.12.3 (`dmn-viewer.production.min.js`, the
output header renderer) the input header `th.input-cell` carries `data-col-id`, while the
output header `th.output-cell` gets no attributes at all — the output id is only the
inferno `key`, which never reaches the DOM. The rule body cells do carry it
(`td.output-cell[data-col-id]`). Consequences of the label lookup:

- two outputs with the same label: both get painted when either one changes;
- an output with no label (dmn-js shows its `name` in `.output-name` instead of
  `.output-label`): never painted.

Not worked around (no stable hook in the DOM); postponed. **Next step: research option 3**
(a dmn-js change that puts `data-col-id` on the output header) — whether upstream accepts
it, which release would carry it, and what `npm run sync:libs` then needs; the painter
would then match outputs by id like `#paintInputDiffs`. Options, none tried yet:

1. Positional: the n-th `thead th.output-cell` is the n-th `<output>` of the shown XML
   (dmn-js renders outputs in business-object order). Smallest change; relies on render
   order, not on an id.
2. Column index from the body: `td.output-cell[data-col-id=<id>]` gives the column, its
   `cellIndex` the header cell. Ties the painter to the table layout, and a table with
   no rules has no body cells.
3. Upstream: ask dmn-js to put `data-col-id` on the output header the way it does on the
   input header, then match by id like `#paintInputDiffs`.
4. Override the `table.head` output-cell component through dmn-js `components`
   (`onGetComponent`) to add the attribute — a fork of internal markup.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-10-08 · claude-opus-5-5 · branch `fix/ux-0004-semantic-comparison-accuracy` (follow-up)

Closed the gaps found while fixing the first three points (one commit each, failing test
first), checked against the panel code in `bpmn-js-properties-panel` 5.65.1:

- `camunda:asyncBefore`/`asyncAfter`/`exclusive` on the multi-instance body map to
  `Multi-instance` (the panel's `multiInstanceAsynchronousBefore/After`,
  `multiInstanceExclusive`), no longer to the activity's `Asynchronous continuations`;
  the subprocess test that asserted the old mapping is updated.
- Error definitions: an added/removed `bpmn:errorEventDefinition` and its
  `camunda:errorCodeVariable`/`errorMessageVariable` map to `Error`; an added/removed
  `camunda:errorEventDefinition` and its `expression` map to `Errors`.
- Attribute defaults: `isInterrupting` and `cancelActivity` default to `true`, so an
  explicit `"true"` against an absent attribute is no longer a change (it used to mark
  the element changed and, after the first session, paint the header). This resolves
  the accepted risk recorded below.
- Layer-2 spec `differ-prop-group-accuracy.spec.js` checks the error code, the
  multi-instance retry cycle and `isInterrupting` in the real panel (all three fail on
  the pre-fix comparator).
- DMN outputs stay postponed; the next step (research a dmn-js change) is in Context.
- Known gap left (review, low): the same explicit-default issue for `camunda:exclusive`
  (default `true`) and `camunda:asyncBefore`/`asyncAfter` (default `false`) on any
  async-capable node. Pre-existing for activities, not extended here to keep the change
  narrow; adding them to `#ATTRIBUTE_DEFAULTS` would cover it.

### 2026-10-08 · claude-opus-5-5 · branch `fix/ux-0004-semantic-comparison-accuracy`

Three of the four points fixed, one commit each, failing test first (fixture
`camunda-base.bpmn` gained an external task with a boundary error event and a `bpmn:error`):

- Error code: `bpmn:error` lives outside the process, so its change never reached the
  referencing elements. Tracked like messages/escalations (`#changedErrors`,
  `#isChangedErrorRef`); `errorRef` maps to `Error`, `camunda:errorEventDefinition/errorRef`
  (an external task's error definitions) to `Errors`.
- `failedJobRetryTimeCycle`: the panel shows the multi-instance body's own retry cycle in
  `Multi-instance` and the activity's in `Job execution`. Diff names carry no ancestry, so
  `#diffNameOf` qualifies the tag when it sits in the loop characteristics'
  `extensionElements`; the commented-out mapping is replaced by the qualified one.
- `startEvent/isInterrupting`: the panel has no group for it; like `cancelActivity`
  (BUG-0039) it changes the header text ("… (Non Interrupting)"), so it now routes to the
  header highlight (`typeChangedIds`) instead of being ignored. Decision: header over a
  group title, consistent with the existing `cancelActivity` handling. A start event with
  no event definition would get the header painted without its text changing; such
  events cannot be non-interrupting in valid BPMN, so it is left as is. Accepted risk
  (review): an explicit `isInterrupting="true"` against an absent attribute (the same
  default) paints the header with no text change — the element was already marked
  changed before this branch, and `cancelActivity` has the same trait; normalizing
  attribute defaults would fix both and is left for a separate change.
- DMN outputs: not done — see "Remaining" in Context.
