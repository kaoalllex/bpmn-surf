---
id: REFAC-0009
title: Lighten the BpmnDiffer orchestrator — separate wiring from the glue to bpmn-js and the DOM
priority: medium
status: open
---

## Statement

`bpmn-differ.js` (`BpmnDiffer`, ~460 lines) simultaneously orchestrates the diff
flow (load versions → compare → coloring → table) and holds a lot of
low-level glue unrelated to orchestration:

- creating and configuring the bpmn-js modeler (`#createModeler`);
- hacks for hiding the editor UI (`#hideSchemaEditorControls` with `delay(100)` twice,
  `#hideModelerPalleteAndPoweredByLabel`);
- opener-tab navigation via the `window.name` trick (`#navigateOpenerTab`);
- resolving the resource URL in a nested tab (`#getLinkOrScriptHref`).

Mixing levels makes the class hard to read, increases churn, and prevents covering
the orchestration with unit tests (it is currently in `UNTESTED_BY_DESIGN`).

Proposal: extract separate collaborators — for example `BpmnModelerFactory`
(creating/configuring bpmn-js + hiding the palette/context pad) and `OpenerTabNavigator`
(the `window.name` trick, fallback to a new tab). Then `BpmnDiffer` remains
a thin orchestrator; the extracted parts are covered with tests where possible.

Behavior does not change — this is a refactoring (see the constraint "don't mix refactoring
with features/fixes"; do it in small steps).

## Context

- Affected: `src/differ/bpmn/bpmn-differ.js`; it is worth assessing
  `src/differ/dmn/dmn-differ.js` in parallel.
- Related to [REFAC-0010] (a shared base for the BPMN/DMN differs) — it is convenient to do the lightening
  before or together with extracting the shared base.
- `OpenerTabNavigator` is a candidate for a separate testable class (the logic of choosing
  "navigate the opener vs. a new tab").

## Work log
