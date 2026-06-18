---
id: REFAC-0010
title: Shared differ base — eliminate the parallel BPMN/DMN duplication
priority: medium
status: open
---

## Statement

`bpmn-differ.js`/`dmn-differ.js` and `bpmn-differ-view.js`/`dmn-differ-view.js` are
parallel structures with common concepts (loading two versions, the branch
indicator, switch branch, download, message bootstrap, header layout), but they share
only leaf classes (`DifferParams`, `DiagramVersions`, `BranchIndicator`,
`DiffType`), not a shared orchestrator/view base.

A symptom of the missing abstraction: the documentation (`CLAUDE.md`, `docs/testing.md`,
`docs/conventions.md`) is forced to repeat over and over "when changing shared classes,
check both the BPMN and the DMN differ" — manual discipline substitutes for what a shared
base class / template method should guarantee.

Proposal: extract a base `DifferBase` (the shared `show()` flow: bootstrap,
version loading, switch/download, branch indicator) and `DifferViewBase` (the shared
layout/header/footer), leaving in the subclasses only the diagram-rendering specifics
(bpmn-js modeler vs. dmn-js viewer) and the comparison. This will reduce duplication and the risk
of "fixed one, forgot the other".

Behavior does not change. Do it in small steps; on each, check both diff types
manually against the checklist (`docs/testing.md`).

## Context

- Affected: `src/differ/bpmn/bpmn-differ.js`, `src/differ/dmn/dmn-differ.js`,
  `src/differ/bpmn/bpmn-differ-view.js`, `src/differ/dmn/dmn-differ-view.js`.
- Related to [REFAC-0009] (lightening `BpmnDiffer`) — a natural preceding
  or joint step.
- The structural test `test/structure/message-id.test.js` already pins the match of
  message-id between the scopes; a shared base will also shrink that surface.

## Work log
