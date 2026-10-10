---
id: REFAC-0017
title: Camunda 7 / Camunda 8 as two dialect implementations instead of branches
priority: low
status: open
---

## Statement

Move every decision that depends on the Camunda dialect into two objects behind one
interface: `camunda7-dialect.js` and `camunda8-dialect.js` (or two objects in
`camunda-dialect.js`). The differ then holds a dialect object instead of the string
`'c7' | 'c8'`, and the code calls `dialect.handlerKey(bo)` and `dialect.callerTerm(id)`
instead of branching with `dialect === CAMUNDA_DIALECT.C8 ? … : …`. Behaviour stays the
same. This is a refactor, not part of a feature.

## Context

[FEAT-0038] added Camunda 8 with one dialect per differ tab. Detection lives in
`src/differ/shared/camunda-dialect.js`, and the differ shares the value with each
component through a getter (`() => this.#dialect`). Today these places branch on it, each
in a few lines:

- `BpmnDiffer#createModeler`: the moddle descriptor (`params.camundaBpmnModdle` /
  `params.zeebeBpmnModdle`) and the properties provider module;
- `PropertiesGroupExpander.relevantGroupsForElement`: the Zeebe panel's group names
  (service/send task → "Task definition", user task → "Form");
- `calledProcessId` / `calledDecisionId` (`camunda-dialect.js`): `calledElement` /
  `decisionRef` vs the `zeebe:CalledElement` / `zeebe:CalledDecision` extension;
- `CallerLocator#callerTerm` / `DecisionCallerLocator#callerTerm`: `calledElement=` /
  `decisionRef=` vs `processId=` / `decisionId=`;
- `HandlerLocator.handlerKeyFromBusinessObject`: `#camundaKey` vs `#jobTypeKey`.

**What not to split:** `HandlerLocator` as a whole. Code search, the annotation parser,
changed-file scanning and the exact match do not depend on the dialect (the annotation
list is shared). Only the key derivation does, so it moves into the dialect objects. Two
locators would duplicate the shared part.

**Interface sketch:**
- `id`: `'c7' | 'c8'`;
- `moddleExtensions(params)`;
- `propertiesProviderModule()`;
- `calledProcessId(bo)`, `calledDecisionId(bo)`;
- `processCallerTerm(id)`, `decisionCallerTerm(id)`;
- `handlerKey(bo)`;
- `implementationGroup(elementType)`, `formGroup`.

`detectCamundaDialect(...)` returns one of the two objects.

**Why:** everything dialect-specific sits in two files, so a missing piece is visible;
each dialect can be tested alone; the callers have no branches. The gain is modest (about
seven short branches, and no third dialect is expected — Camunda 7 is end of life). The
natural moment is [FEAT-0019] (listener badges), which adds new dialect-dependent
decisions (the `zeebe:executionListener` / `zeebe:taskListener` job types).

**Checks:** the unit and Layer-2 suites as they are (`differ-c8-*` and the C7 specs) — the
behaviour must not change; `registries.test.js` if new files are added.

## Work log

<!-- Each AI session on the task — a separate entry by the template in docs/issues/README.md.
     Add new entries on top (freshest first). -->
