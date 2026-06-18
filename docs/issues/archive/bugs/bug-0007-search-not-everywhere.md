---
id: BUG-0007
title: Search in the differ doesn't work everywhere
priority: medium
status: done
---

## Statement

The built-in bpmn-moddle search (Ctrl/Cmd+F) on Win10 is intercepted by Chrome's search.

## Context

- Doesn't work on Windows with a non-Latin keyboard layout — a bpmn-io bug: https://github.com/bpmn-io/bpmn-js/issues/1888
- Workaround: switch to the English layout before Ctrl+F.
- Needed: on the differ tab, always use only the built-in search.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (freshest first). -->

### 2026-06-15 · claude-opus-4-8 · branch `feature/feat-0006-search-element`

Closed together with [FEAT-0006]. The differ tab now has its own floating
search panel (`SearchPanel`, `search-panel.js`) instead of the viewer's built-in
search. Ctrl/Cmd+F is intercepted by `event.code === 'KeyF'` (the physical
key, independent of the layout → works even on a non-Latin Win10 layout, where
bpmn-io broke) + `preventDefault` suppresses Chrome's native search. The workaround
with switching the layout is no longer needed.
