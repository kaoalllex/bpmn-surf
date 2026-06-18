---
id: UX-0002
title: Highlight specific variables on mapping changes
priority: medium
status: done
---

## Statement

When In/Out mappings change, highlight the specific added/removed/changed variables, rather than the whole group in the properties panel.

## Context

- Currently, when In/Out mappings change, the whole group is highlighted in the properties panel.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (freshest first). -->

### 2026-06-15 · claude-opus-4-8 · branch `feature/ux-0002-highlight-mapping-variables`

Per-item highlighting of changed entries in the list groups of the properties panel (In/Out mappings, Inputs/Outputs) on top of the existing group-header highlighting.

- `bpmn-xml-comparator.js`: `compare()` additionally returns `nodeIdToMappingChanges` (id → Map(group → `[{label, changed}]`)); entries are extracted from the direct children of `bpmn:extensionElements`, matched by `target` (mappings) / `name` (inputs/outputs), `changed` distinguishes "changed" (present in both, differs) from "added/removed" (only in the shown version). The `businessKey`/`variables="all"` entries are skipped (they are in other panel groups).
- `properties-panel-highlighter.js`: `setDiffData` takes a 3rd argument; the group header is colored as before, additionally the specific entries are colored (changed→blue, added→green/MR, removed→red/target per `isTargetBranchShownFunc`); falls back to highlighting only the group if the entry was not matched.
- Tests: `bpmn-xml-comparator-camunda.test.js` (+5), `properties-panel-highlighter.test.js` (+6), the `properties-panel.html` fixture extended. `npm test` — 587 green.
