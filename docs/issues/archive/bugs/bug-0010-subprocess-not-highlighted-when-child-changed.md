---
id: BUG-0010
title: Subprocess is not highlighted when only a nested element changed
priority: medium
status: done
---

## Statement

If the changes are inside a subprocess (including a subprocess within a subprocess),
only the changed child element itself is highlighted in blue, but the parent
subprocess is not. On a collapsed subprocess this is especially troublesome: its children are not visible,
and nothing signals the changes inside.

Example (the "Periodic creation of a QES application" diagram): changes inside the
"Issue UZ" step — it is highlighted, but the enclosing "UZ Issuance" subprocess is not
highlighted.

Expectation: when a nested element changes, the highlight should also reach the
parent subprocesses (at all nesting levels), so that the change is visible
from the top, not only on the leaf.

## Context

- Regression: previously the enclosing subprocess was highlighted, but not the changed step
  itself inside. The leaf element highlight was fixed (presumably around the differ
  fixes from 2026-06-10…12: `188314a`, `3b35624`), but in doing so the highlight of the
  parent subprocess was lost.
- The current behavior is **intentionally locked in** by code and a test:
  - `bpmn-xml-comparator.js:282-289` — `#compareNodes()`: subprocess children are excluded
    from the diff of the subprocess itself ("Do not compare children of subprocesses…"), they are compared
    separately in `compare()`. Therefore only the child element ends up in `changedShapeIds`.
  - `diff-highlighter.js` — highlights exactly the elements from the computed set, without
    walking up the tree (there is no propagation of the highlight to the ancestor).
  - `test/bpmn-xml-comparator-camunda.test.js` — the test `flags a changed inner element
    but not the enclosing subprocess` explicitly requires that the subprocess NOT end up in
    `changedShapeIds` when only the child changes. When fixing, this test needs to be
    revisited/updated.
- Fix direction: when a change of a nested element is detected, add its
  ancestor subprocesses to the set for highlighting (propagation up the tree,
  presumably in `bpmn-xml-comparator.js#compare()`).
- Check the shared classes of the differ page and both differs (BPMN/DMN) — the highlight is shared.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-10-03 · claude-opus-5-5 · branch `fix/bug-0010-subprocess-highlight`

Root cause confirmed: `#compareNodes` skips subprocess children (they are compared on
their own), so only the leaf reached `changedShapeIds`, and `DiffHighlighter` paints
exactly that list. Fix:

- `BpmnXmlComparator#compare` returns `subProcessWithChangesIds` — every enclosing
  `bpmn:subProcess` (any depth) of an added/removed/changed element. Removed children
  are found in the other document; ancestors only the other side has, ancestors that
  are themselves added/removed, and the subprocess's own `extensionElements` /
  `multiInstanceLoopCharacteristics` nodes do not count. `changedShapeIds` and
  `nodeIdToDiffsMap` are unchanged, so the leaf keeps its own fill (the 188314a/3b35624
  regression) and the changes table / properties panel do not list the subprocess.
- `BpmnDiffer#paintDiffs` paints them with the CHANGE stroke only (blue border and
  label, own fill kept — `setColor({stroke})` leaves the fill alone) and adds them to
  the ☼ highlight. Works for collapsed subprocesses (the shape on the parent plane) and
  after drill-down (the leaf is painted by id on its own plane).
- DMN unaffected: comparator and highlighter are BPMN-only, `DiffType` is not changed.
- Tests: the unit test that pinned the bug was reworked (leaf still the only changed
  shape + the new field), cases added for nesting, added/removed children, an added
  subprocess, a changed-and-containing subprocess and the subprocess's own nodes; the
  Layer-2 pin `differ-subprocess-bug-0010.spec.js` became
  `differ-highlight-subprocess.spec.js` (a collapsed subprocess inside an expanded one,
  including drill-down).
- Sandbox: `order-service/.../order/QesApplication.bpmn` on `main` and MR !15
  (`test/subprocess-child-changes`) with child-only changes — renamed leaf in an expanded
  subprocess, renamed leaf in a nested collapsed one, a child added to and one removed
  from collapsed subprocesses, plus an untouched control subprocess.

Not done (out of scope): edit mode (`EditSession.setMrDiff`) does not mark containing
subprocesses; `bpmn:transaction` / `bpmn:adHocSubProcess` are not treated as
subprocesses (the comparator never did — their children are compared as part of them,
so they are flagged changed themselves).
