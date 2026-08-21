---
id: BUG-0029
title: BpmnXmlComparator.compare() throws on a diagram with no executable process
priority: low
status: open
---

## Statement

`BpmnXmlComparator.compare(myXml, otherXml)` picks the process to walk as

```js
const myProcessNode = Array.from(myDoc.getElementsByTagName('bpmn:process'))
    .filter(elem => elem.getAttribute('isExecutable') === 'true')[0];
const myNodesWithIdAttr = myProcessNode.querySelectorAll('[id]');
```

and dereferences the result immediately. A BPMN file whose only process carries
`isExecutable="false"` (or no such attribute at all) yields `undefined` and the
next line throws a `TypeError`.

Only `myDoc` is affected: `otherDoc` is reached exclusively through
`getElementById`, and the message/escalation scan works by tag name.

The throw propagates out of `#prepareDiffData` → `#showMr`/`#showBranch` →
`BpmnDiffer#show()`, none of which catch it, so the differ page is left blank
with an unhandled rejection rather than showing the diagram.

Expected: a diagram with no executable process renders, with an empty diff
(nothing to compare) rather than an exception.

## Context

Found while reviewing [FEAT-0031] (BPMN edit mode) — the edit session recomputes
the diff after every change, so a user clearing "Executable" in the properties
panel hits this on the next recompute. FEAT-0031 contains that case locally: its
recompute catches, warns, keeps the last good colouring and marks the toolbar
toggle as paused. That local guard is what makes this bug low priority; it does
not fix the view-mode path, where the same file still breaks the page.

Affected: `src/differ/bpmn/bpmn-xml-comparator.js` (`compare()`),
`src/differ/bpmn/bpmn-differ.js` (`#prepareDiffData`, which has no try/catch).

Not reproduced from a real repository file — the diagrams this extension is
pointed at are executable Camunda processes. Worth fixing at the root anyway:
the guard belongs in `compare()`, where every caller routes through.

## Work log

<!-- Each AI session on the task — a separate entry by the template below.
     Add new entries on top (freshest first). -->
