---
id: FEAT-0006
title: Search for an element on the schema
priority: medium
status: done
---

## Statement

Search by an element's name or by the name/value of its parameter (e.g. find a branch whose condition uses the variable `preapprove_reapeated_turnover`). Highlight the found element.

## Context

- The viewer's built-in Ctrl+F searches only by element names.
- Related to [BUG-0007].

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-06-15 · claude-opus-4-8 · branch `feature/feat-0006-search-element`

Implemented full-text search over the elements of a BPMN schema. The new `ElementSearcher`
(`element-searcher.js`) builds an index from `elementRegistry` and searches ids by name,
id and any parameters — condition expression and its variables, In/Out mappings,
Inputs/Outputs, delegate/class/topic/expression, calledElement, documentation
(a recursive traversal of the moddle object, without following references to other elements).
The floating `SearchPanel` (`search-panel.js`) opens on Ctrl/Cmd+F,
highlights all matches, centers and selects the current one (the properties panel
shows its parameters), provides ◀/▶ navigation and a counter. Coverage: 28 unit tests
on `ElementSearcher`. Along the way [BUG-0007] was closed (layout-independent interception of
Ctrl+F). BPMN only; a DMN table is searched with the browser's standard Ctrl+F over DOM text.
