---
id: BUG-0052
title: Message flows, collaboration artifacts and added/removed pools are not diffed
priority: medium
status: done
---

## Statement

`BpmnXmlComparator.compare` walks the `[id]` descendants of the main `bpmn:process`
only. What lives in the `bpmn:collaboration` is outside that walk: a renamed, added or
removed `bpmn:messageFlow` gives no highlight and no changes-table row (although
`bpmn:messageFlow` is listed in `#ROW_TAG_NAMES`), and neither do the collaboration's
own artifacts (a text annotation or association drawn outside any pool). [BUG-0050]
compares a pool's own attributes, but only when the pool exists on both sides — a pool
added or removed in the MR is not shown either; worse, a pool wrapped around an existing
process in the MR takes that process's own changes and shows as "changed" rather than
added.

## Context

- Found while fixing [BUG-0050]: on `test/e2e/fixtures/c7-order-main-base.bpmn`,
  renaming `MFlow_1` and adding a second message flow both yield an empty diff.
- `src/differ/bpmn/bpmn-xml-comparator.js` (`compare`, `#compareProcessLevel`);
  the changes table and the painters already handle rows and shapes generically.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-10-12 · claude-opus-5-5 · branch `fix/bug-0050-process-level-changes`

`BpmnXmlComparator.compare` walks the `[id]` descendants of every `bpmn:collaboration`
along with the main process, so pools, message flows and collaboration artifacts are
changed/added/removed like any element. `#compareProcessLevel` now only puts the
process's own changes on its pool (or `changedProcessIds`); a pool added around an
existing process stays in `missingShapeIds` and only carries the process groups.
Tests: comparator unit tests, a collaboration case in `differ-process-level.spec.js`.
