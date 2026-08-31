---
id: UX-0004
title: Accuracy of semantic comparison and property highlighting
priority: medium
status: open
---

## Statement

Eliminate accumulated comparator edge cases:

- Highlight a change of the error code (`bpmn:error`): currently the change is not highlighted.
- `failedJobRetryTimeCycle` belongs to two groups, one is supported (the mapping of `camunda:failedJobRetryTimeCycle` to `Multi-instance` is commented out).
- Pick the correct property panel group title for `bpmn:startEvent/isInterrupting`.
- Compare DMN outputs by id, not by label — currently by label, because there is no id attribute on outputs in the html.

## Context

- Change of the error code (`bpmn:error`): seen on an MR that changed a task's error code and
  got no highlight in the diff. Code: `bpmn-xml-comparator.js` (property mapping → group `Error`).
- `failedJobRetryTimeCycle`: code `bpmn-xml-comparator.js`.
- Group title for `bpmn:startEvent/isInterrupting`: code `bpmn-xml-comparator.js`.
- DMN outputs by id instead of label: code `dmn-xml-comparator.js#compareOutputs`.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
