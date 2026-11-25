---
id: BUG-0053
title: The diff misses changes that alter behaviour (flow endpoints, default flow, DMN rule order, aggregation, …)
priority: high
status: open
---

## Statement

Several changes that can alter how a process runs or what a decision returns produce **no
highlight at all** today. A reviewer looking at such a merge request sees an unchanged
element, or an empty diff, and has no reason to look closer.

Confirmed (an empty diff from the production comparators on otherwise identical files):

- **BPMN — a sequence flow now starts or ends at another element** (same flow id,
  changed `sourceRef` / `targetRef`).
- **BPMN — a gateway's (or activity's) default flow changed** (`default`).
- **DMN — two rules swapped places** under hit policy FIRST (rules are matched by id;
  their relative order is never compared).
- **DMN — the COLLECT aggregation changed** (e.g. SUM → MAX): `aggregation` is not compared.
- **DMN — a rule description was removed** (compared only when both sides have one).

Suspected from the code, to confirm with a test first:

- **BPMN — an element moved into another subprocess** with its own attributes unchanged:
  elements are matched by id across the whole document, and the parent is never compared.
- **BPMN — the order of an exclusive gateway's outgoing flows changed.** Camunda 7
  evaluates the outgoing conditions in XML order, so with two conditions true at once the
  order picks the winner.
- **DMN — a rule entry exists on one side only** (an entry added to a surviving rule):
  unmatched entries are skipped.
- **DMN — `annotationEntry`** is not compared.
- **DMN — more than one decision in a file**: only the first decision (by document order)
  of each side is compared, so a change in another decision, or a reorder of decisions,
  is invisible or compares the wrong pair.
- **BPMN — a change in a second (non-main) process** of a collaboration: only one process
  is walked.

Expected: each of these is reported as a change of the owning element (or of the table, for
order and aggregation), in its property group where one exists.

Out of scope: comparing the diagram layout (`bpmndi:` / `dmndi:`) — see [FEAT-0041].

## Context

GitHub: [#51](https://github.com/kaoalllex/bpmn-surf/issues/51)

Found by an independent review of the [FEAT-0040] requirements, which depend on these
changes being detected: an "only the layout changed" notice would otherwise state
something false (a retargeted flow plus a moved box would qualify), and the routing and
DMN rules of FEAT-0040 would have nothing to match.

Code:

- `src/differ/bpmn/bpmn-xml-comparator.js` `#compareNodesAttributes` (around line 1000)
  skips `targetRef`, `sourceRef` and `default` explicitly; `#CONNECTOR_TAG_NAMES`
  (`bpmn:incoming` / `bpmn:outgoing`) are not compared either (`#compareNodes`, around line
  675). The skip was presumably there to avoid noise from re-wired connectors whose ends
  are themselves reported as added/removed — keep that case quiet (an endpoint change caused
  only by the end element being replaced may still deserve one row, not three).
- `#findMainProcessNode` (around line 481) picks one process.
- `src/differ/dmn/dmn-xml-comparator.js`: `compare()` takes `getElementsByTagName('decision')[0]`
  on each side; `#compareHeader` compares `name` and `hitPolicy` only; `#compareRules`
  matches by id without order; `#compareRuleNodes` (around line 97) compares `description`
  only when the other side has one and skips entries missing on the other side.
- Painting: a table-level change (order, aggregation) needs a target in the DMN view —
  `dmn-diff-painter.js` already paints the hit-policy cell by a dedicated selector
  (`span.hit-policy-value`); aggregation is shown in the same header cell by dmn-js.

Twin paths: Camunda 7 and Camunda 8 fixtures for the BPMN cases (`zeebe:` diagrams use
the same `sourceRef`/`targetRef`/`default`); both directions of Switch branch; edit mode
uses the same comparator through `EditSession.setMrDiff`.

Tests: one comparator unit test per case above, positive and negative (e.g. an endpoint
change vs a pure waypoint edit; a reorder under FIRST vs under UNIQUE — the latter is still a
change of the table, but [FEAT-0040] will level it differently).

## Work log

<!-- Each AI session on the task — a separate entry by the template below.
     Add new entries on top (freshest first). -->
