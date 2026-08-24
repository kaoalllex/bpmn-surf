---
id: BUG-0029
title: BpmnXmlComparator.compare() throws on a diagram with no executable process
priority: low
status: done
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

Expected: a diagram with no executable process renders, with the diff computed
on the process it does have, rather than an exception.

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

### 2026-08-24 · claude-opus-5 · branch `feature/feat-0031-bpmn-edit-mode`

Fixed at the root in `compare()`: the executable-process lookup became
`find(isExecutable) ?? processes[0]`, and the `querySelectorAll` behind it is
guarded, so a document with no `bpmn:process` at all yields an empty diff
instead of throwing.

Chose the fallback over the empty diff this file originally specified, on the
human's call: `isExecutable` only picks the main process out of a collaboration
and several executable processes in one file are not supported anyway, so the
flag says nothing about what is worth comparing. A file whose only process
carries `isExecutable="false"` now gets a real diff — and in edit mode clearing
"Executable" no longer freezes the colouring.

That makes the FEAT-0031 guard in `EditSession#recompute` a generic safety net
rather than this bug's workaround; its comment was rewritten to say so (the
try/catch itself is kept — the editor can still reach a shape `compare()` chokes
on).

Tests: three cases in `test/differ/bpmn/bpmn-xml-comparator.test.js`
(`describe('BpmnXmlComparator non-executable process')`) — the non-executable
single process, the multi-process document where the executable one must still
win, and the no-process document. The first and third were observed failing with
the reported `TypeError` before the fix. `npm test` — 1175/1175 green.
