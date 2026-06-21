---
id: FEAT-0029
title: Auto-expand the most relevant property-panel groups on element selection
priority: medium
status: done
---

## Statement

In the BPMN differ, when an element is selected and the properties panel is open, the
groups in the panel are collapsed by default — the user has to hunt for and manually open
the group that actually matters for the selected element. The highlighter only paints the
**group header** to point the user at where to click (`PropertiesPanelHighlighter`, comment
"the user's entry point in the group list"), but does not open it.

Auto-expand the groups most relevant to the selected element so the meaningful properties
are visible immediately, on two axes (expand the **union**, dedup by group name, **only
expand — never collapse**):

- **Axis A — changed groups (from the diff).** Every group listed in `nodeIdToDiffsMap` for
  the selected element. The data is already computed by `BpmnXmlComparator` and published to
  the highlighter; reuse it. Expand changed groups **as-is**, even if the list on the shown
  side happens to be empty (e.g. a mapping was removed) — "it changed, show the user".

- **Axis B — groups characteristic of the element type.** Map element type / business object
  to the group(s) that define it:

  | Group | When to expand (type / condition) |
  |---|---|
  | **Condition** | `bpmn:SequenceFlow` whose `source` is a gateway; events with `bpmn:ConditionalEventDefinition` |
  | **Message** | `bpmn:ReceiveTask`; events with `bpmn:MessageEventDefinition` (throw/send carry the same group, include them too) |
  | **Implementation** | tasks with an implementation: `bpmn:ServiceTask`, `bpmn:SendTask`, `bpmn:ScriptTask`, `bpmn:BusinessRuleTask` |
  | **Timer** | events with `bpmn:TimerEventDefinition` |
  | **Error** | events with `bpmn:ErrorEventDefinition` |
  | **Escalation** | events with `bpmn:EscalationEventDefinition` |
  | **Multi-instance** | any element carrying `bpmn:multiInstanceLoopCharacteristics` |
  | **Forms** | `bpmn:UserTask` |
  | **In mappings** | element has ≥1 `camunda:In` (non-empty only) |
  | **Out mappings** | element has ≥1 `camunda:Out` (non-empty only) |
  | **Inputs** | element has ≥1 `camunda:inputParameter` (non-empty only) |
  | **Outputs** | element has ≥1 `camunda:outputParameter` (non-empty only) |

  **`Called element` is deliberately NOT expanded** for `bpmn:CallActivity`: diving into the
  called process is already one click away via the `⤵` dive-in overlay (`CallActivityNavigator`),
  so opening the group would be redundant. The useful content for a Call Activity is its
  In/Out mappings, covered by the list-group rule below.

  **List groups** (`In mappings`, `Out mappings`, `Inputs`, `Outputs`) are expanded **only
  when non-empty** — an empty list group is noise. The non-empty check is decided from the
  business object (see "Detecting non-empty"), not from the rendered DOM. The non-empty gate
  applies to axis B only; axis A expands changed list groups regardless.

**Event detection is keyed on `bo.eventDefinitions`, not on `element.type`.** This makes the
rule uniform across all event-bearing elements — start, intermediate catch/throw, **boundary**,
and end events — so e.g. a message boundary event yields `Message`, a timer boundary `Timer`,
an error boundary `Error`, an escalation boundary `Escalation`, a conditional boundary
`Condition`. The implementation MUST NOT enumerate concrete event types in a `switch` (that
risks dropping `bpmn:BoundaryEvent`); precedent: `CorrelationNavigator#extractMessageName`
reads the nested `MessageEventDefinition` the same way.

Group titles above are the **real panel header texts** — the same strings
`BpmnXmlComparator#DIFF_TO_PROPERTY_GROUP_MAP` / `#LIST_GROUP_CONFIG` use and that the
highlighter already matches against `.bio-properties-panel-group-header-title`.

BPMN only — the DMN differ has no properties panel (`DmnDifferView`).

## Context

Idea raised by the user. Builds directly on the existing properties-panel infrastructure:

- **Panel internals.** `bpmn-js-properties-panel` (`libs/bpmn-js-properties-panel`). Groups
  are collapsible: an open group's entries container is `.bio-properties-panel-group-entries`
  **with class `open`**; the clickable toggle is the group header (`title.parentElement`, i.e.
  `.bio-properties-panel-group-header`). Open state is internal preact state
  (`useLayoutState(['groups', id, 'open'], …)`); the simplest control is a DOM click on the
  header, matching how `PropertiesPanelHighlighter` already locates groups by header text.

- **Single integration point.** `bpmn-differ.js#onSelectedElementChanged(elemId)` (the only
  `selection.changed` handler; already filtered to `newSelection.length === 1`, and it strips
  the `_label` suffix). It already drives the highlighter, condition rendering and the
  navigators. Synergy: expanding `Condition` also makes the formatted-condition block that
  `PropertiesPanelHighlighter#showConditionExpression` injects into that group actually visible.

### Implementation plan

1. **New class `PropertiesGroupExpander`** — `src/differ/bpmn/properties-group-expander.js`,
   modeled on `PropertiesPanelHighlighter`:
   - `init(elementRegistry)` — store the registry.
   - `setDiffData(nodeIdToDiffsMap)` — axis A source; called from `#prepareDiffData` next to
     the highlighter's `setDiffData`.
   - `static relevantGroupsForElement(element)` → `string[]` — **pure** axis-B mapping over
     `element.type` / business object (gateway `source.type`, `*EventDefinition` presence,
     `multiInstanceLoopCharacteristics`, and the non-empty list-group checks). Unit-testable
     with fake business objects.
   - `async expandRelevantGroups(elementId)`:
     1. group names = `relevantGroupsForElement(el)` ∪ `nodeIdToDiffsMap.get(elementId)` (dedup);
     2. for each, via `doWithAttempts`, find the header by `.bio-properties-panel-group-header-title`
        text (same lookup as the highlighter — extract/share a helper);
     3. read the `open` class on the **header element itself** (`.bio-properties-panel-group-header`);
        **if not open → `click()` the header** (detect-before-click is critical, otherwise a group
        that is open by default would get toggled closed). The header is the one reliable signal:
        the panel marks both plain groups and list groups by adding `open` to the header, while
        their entries containers differ (`.bio-properties-panel-group-entries` vs
        `.bio-properties-panel-list`);
     4. group absent in the DOM → silent no-op (no `console.warn`, unlike the highlighter:
        for axis B a missing group is normal).

2. **Wire into `bpmn-differ.js`:**
   - construct in `#init()` (field `#propertiesGroupExpander`), call `init(elementRegistry)`
     next to the highlighter init;
   - in `#prepareDiffData` add `this.#propertiesGroupExpander.setDiffData(diff.nodeIdToDiffsMap)`;
   - in `#onSelectedElementChanged` add `this.#propertiesGroupExpander.expandRelevantGroups(this.#selectedElementId)`.

3. **Detecting non-empty (list groups).** From the business object, not the DOM:
   inspect `bo.extensionElements.values` for `camunda:In` / `camunda:Out` and
   `camunda:InputOutput` (its `inputParameters` / `outputParameters`). Reasons: pure and
   testable; avoids the preact timing trap (a DOM count can't tell "not rendered yet" from
   "genuinely empty" without waiting out the full `doWithAttempts` timeout).

4. **Registries (3, guarded by `test/structure/registries.test.js`):** add the new differ-page
   file to `manifest.json#web_accessible_resources`, `utils.js#loadScripts` (before
   `bpmn-differ.js`), and `test/support/scope.js#SCOPE_FILES`. Not in `content_scripts`
   (differ scope, not content scope).

5. **Tests** — `test/differ/bpmn/properties-group-expander.test.js`:
   - unit on the pure `relevantGroupsForElement`: many small cases (gateway-flow→Condition,
     ReceiveTask / message-event→Message, message/timer/error/escalation events,
     multi-instance, UserTask→Forms, ServiceTask/SendTask/ScriptTask/BusinessRuleTask→
     Implementation, non-empty In/Out/Inputs/Outputs→list groups, empty list groups→excluded,
     CallActivity does NOT yield Called element, a plain element→`[]`);
   - jsdom test of the DOM logic: expands a collapsed group, **leaves an already-open group
     untouched**, no-op when the group is absent, dedup of A∪B.

6. **Docs.** Add the new file to `docs/architecture.md` (the `src/differ/bpmn/` tree + the
   key-files table).

### Edge cases / decisions

- Only single selection (already enforced by the handler).
- Each element is auto-expanded **once** (tracked by id in `#expandedElementIds`). A
  re-selection of the same element — notably the synthetic one on `Switch branch`, which
  re-imports the diagram — does NOT re-expand, so a group the user manually collapsed stays
  collapsed. This works because the panel preserves the open/collapsed state across the
  re-import (its preact layout state survives the re-render). (Originally "raise on every
  select"; changed after user feedback that Switch branch re-opened manually collapsed groups.)
- Async preact re-render handled by `doWithAttempts` (as in the highlighter — see [BUG-0011]).

### Related

- [FEAT-0014] — highlighting the derived "Process variables" group (same panel, same
  header-text lookup); independent of this task.
- Affected files: new `src/differ/bpmn/properties-group-expander.js`,
  `src/differ/bpmn/bpmn-differ.js`, `manifest.json`, `src/core/utils.js`,
  `test/support/scope.js`, `docs/architecture.md`.

## Work log

<!-- Each AI session on the task is a separate entry per the template below.
     Add new entries at the top (freshest first). -->

### 2026-06-21 · claude-opus-4-8 · branch `feature/auto-expand-relevant-property-groups`

Implemented the feature per the plan. New class `PropertiesGroupExpander`
(`src/differ/bpmn/properties-group-expander.js`): pure `relevantGroupsForElement`
for axis B (events keyed on `bo.eventDefinitions`, gateway sequence flows,
multi-instance, task implementations, UserTask→Forms, non-empty In/Out/Inputs/Outputs)
and `expandRelevantGroups` for the A∪B union expand. Extracted the group-header
text lookup into the shared `utils.js#findPropertiesGroupHeader` (now also used by
`PropertiesPanelHighlighter`). Open-state is detected by the `open` class on the
header element — reliable for both plain groups (`.bio-properties-panel-group-entries`)
and list groups (`.bio-properties-panel-list`), confirmed from the bundled panel
source (corrected the original plan text, which named only the plain container).
Wired into `bpmn-differ.js` (construct/init, `setDiffData`, call from
`#onSelectedElementChanged`); registered in `manifest.json`, `utils.js#loadScripts`
and `test/support/scope.js`. Tests: 28 new cases in
`test/differ/bpmn/properties-group-expander.test.js` (pure axis-B mapping + jsdom
DOM logic). Full suite green (995 pass). Docs: `architecture.md` updated.

Follow-up (same session, same MR): user reported that toggling `Switch branch`
re-opened a group they had manually collapsed. Root cause — the branch switch
re-imports the diagram and re-selects the same element, re-running the expansion.
Fix: auto-expand each element only once (`#expandedElementIds`), so re-selecting
the same element keeps the user's manual collapse (the panel preserves open state
across the re-import). +2 tests (998-ish total green). Edge-case note updated above.
