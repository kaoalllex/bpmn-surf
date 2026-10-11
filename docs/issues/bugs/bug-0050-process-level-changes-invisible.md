---
id: BUG-0050
title: A change to the process element itself is not shown in the diff
priority: medium
status: open
---

## Statement

`BpmnXmlComparator` compares the descendants of the main `bpmn:process`, never the
process element itself. A change to its own attributes or extension elements —
a process-level execution listener, `camunda:historyTimeToLive`, candidate starters,
`camunda:taskPriority`/`jobPriority`, extension properties, the Zeebe twins — gives no
canvas highlight, no changes-table row and no painted group, so the diff looks empty.

Where to show it: a pool (`bpmn:participant` with that `processRef`) shows the process's
groups in its panel (Execution listeners, History cleanup, Candidate starter, External
task, Job execution, Extension properties…), so the change belongs on the pool; a
pool-less process has no shape — its panel opens with nothing selected (the root), so
the changes table needs a row for the process and the root panel the painted group.
Check the same for a `bpmn:participant`'s own attributes (they live in the
collaboration, outside the process, and are not compared either).

## Context

- Found by [INFRA-0011] while building the sandbox's `c7/model-changes` MR: the
  pool-less `Fulfillment.bpmn` changes its process listener `FulfillmentAudit`
  (`event="start"` → `"end"`) and the differ shows nothing.
- `src/differ/bpmn/bpmn-xml-comparator.js` (`compare`: `myProcessNode.querySelectorAll('[id]')`),
  `changes-table-view.js`, `properties-panel-highlighter.js`; both dialects.
- Repro material: sandbox `order-service/.../fulfillment/Fulfillment.bpmn`, `main` vs
  `c7/model-changes`.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
