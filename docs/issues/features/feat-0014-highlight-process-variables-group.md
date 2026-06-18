---
id: FEAT-0014
title: Highlight the "Process variables" group on subprocesses when descendants change
priority: low
status: open
---

## Statement

In the BPMN-differ properties panel, the "Process variables" group (id `CamundaPlatform__ProcessVariables`,
present on `bpmn:Process` / `bpmn:SubProcess` / pools) is not highlighted in blue on changes,
even though other groups are highlighted.

Reason: "Process variables" is a derived read-only list. The panel assembles it via
`getVariablesForScope` from form fields, output mappings, and other variable sources
**within** the scope. The group has no XML property of its own, so in `BpmnXmlComparator`
(`#DIFF_TO_PROPERTY_GROUP_MAP`) there is nothing to map it to: the actual change always lies on a
child element and is already detected there (and highlighted in its group, e.g. "Outputs" /
"Form fields").

What's needed: highlight "Process variables" on the parent subprocess/process when a
variable that falls into its scope changes. Effectively — propagate relevant descendant changes
up to the containing scope element.

Open design questions:
- which descendant changes exactly should be considered as affecting process variables (output parameters,
  form fields, result variables, in/out target, conditional event `variableName`, …);
- to what depth to aggregate (nested subprocesses);
- performance on large diagrams.

## Context

- Discovered during manual verification of the external-libraries upgrade (MR
  https://gitlab.example.com/kaoalllex/bpmn-diff/-/merge_requests/77; bpmn-js 16→18, dmn-js 15→17,
  properties-panel 3.7→3.44). **Not a regression**: the group was not highlighted before the upgrade either.
- Affected files: `src/differ/bpmn/bpmn-xml-comparator.js` (diff→group map, aggregation),
  `src/differ/bpmn/properties-panel-highlighter.js` (highlighting by header text).
- Diagnostics already exist: the comparator logs a diff without a mapped group
  (`bpmn-xml-comparator.js`, a warning in the diff traversal loop), and the highlighter — the case where
  the group is in the diff map but its header is not found in the panel DOM. The log will help pinpoint
  the user's specific scenario.

## Work log

<!-- Each AI session on the task is a separate entry per the template below.
     Add new entries at the top (freshest first). -->
