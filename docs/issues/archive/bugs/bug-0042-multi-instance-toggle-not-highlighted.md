---
id: BUG-0042
title: Toggling the multi-instance marker highlights nothing in the properties panel
priority: medium
status: done
---

## Statement

Adding (or removing) the multi-instance marker on an element — seen in edit mode on
`Payment.bpmn` of [bpmn-surf-test MR !12](https://gitlab.com/kao.alllex/bpmn-surf-test/-/merge_requests/12)
— colours the element as changed, but no property group is highlighted in the panel.
The console shows
`property group not found for diff: bpmn:multiInstanceLoopCharacteristics`.

## Context

When the whole `bpmn:multiInstanceLoopCharacteristics` child is present on one side
only, `BpmnXmlComparator` reports the diff under the element's tag name, which had no
entry in `#DIFF_TO_PROPERTY_GROUP_MAP` (only its attributes and children did).

## Work log

### 2026-09-27 · claude-opus-5-5 · branch `fix/loop-characteristics-panel-highlight`

Mapped `bpmn:multiInstanceLoopCharacteristics` to the `Multi-instance` group in
`src/differ/bpmn/bpmn-xml-comparator.js`; tests for a task and a subprocess in
`test/differ/bpmn/bpmn-xml-comparator-camunda.test.js`. Switching parallel ↔ sequential
(`isSequential`) is still deliberately ignored.

Same session, follow-up: an added/removed `bpmn:standardLoopCharacteristics` warned
the same way. The Camunda 7 properties panel has no group for a standard loop and its
header text does not change, so it is mapped to the ignored group: the element stays
coloured as changed, the panel is left as is, and the warning is gone.
