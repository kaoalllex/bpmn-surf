---
id: BUG-0050
title: A change to the process element itself is not shown in the diff
priority: medium
status: done
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

### 2026-10-13 · claude-opus-5-5 · branch `fix/live-smoke-1.4.0`

The 1.4.0 release smoke (sandbox MR !18, C8 `OrderMain.bpmn`): a process-level change
filled the whole pool with the "changed" colour, so the changed tasks inside it (the same
colour) disappeared into it. Pools and lanes (`DiffType.STROKED_SHAPE_TYPES`) now take the
diff's row colour as a 4px border instead of the fill, in every colour layer: the view
(`DiffHighlighter#paint`), the edit-mode markers (`EditDiffPainter`, new `*-stroke` CSS for
added/removed) and the downloaded XML (`EditXmlColorizer`). Tests: painter and colorizer
unit tests, `differ-process-level.spec.js` (view and edit mode).

### 2026-10-12 · claude-opus-5-5 · branch `fix/bug-0050-process-level-changes`

`BpmnXmlComparator#compareProcessLevel` compares the main process's own attributes,
`bpmn:documentation` and `bpmn:extensionElements` (the other side's process is paired by
id, falling back to the main one), and every participant present on both sides. The
process's changes go to its pool (`changedShapeIds`) or, without a pool, to the new
`changedProcessIds` — the canvas root, never painted: `ChangesTableView` lists it (its
row clears the selection so the panel shows the root), and `BpmnDiffer#highlightRootPanel`
paints the root panel with nothing selected (deselect, after import, edit recompute).
New group rows for the process attributes (History cleanup, Candidate starter, Tasklist,
version tag, isExecutable, process id). Tests: comparator unit tests (C7 + Zeebe),
`differ-process-level.spec.js` (pool-less, pool, C8 pool, edit mode). Message flows,
collaboration artifacts and added/removed pools are split off to [BUG-0052].
