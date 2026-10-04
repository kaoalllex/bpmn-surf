---
id: REFAC-0006
title: Rethink the bottom changes table
priority: medium
status: done
---

## Statement

Rethink the bottom changes table in the footer (`changes-table-view.js`) — it may not be needed at all in its current form. Decide what to do with it: simplify / replace / remove.

## Context

Decide the fate of the table before piling new information into it (for example, the list of changed delegates from [FEAT-0003]).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-10-04 · claude-opus-5-5 · branch `feature/changes-list` (follow-up)
The list now follows the plane on screen: it re-renders on `root.set` and shows only the changes of the shown plane; those inside a collapsed subprocess on it, however deep, collapse into one "N changes inside" row of that subprocess (an outlined badge when the subprocess itself is unchanged); clicking that row highlights and selects the subprocess on the shown plane, like any other row (drilling in stays the canvas's own button). The counters count the rows of the shown plane, a "changes inside" row as one change, so they always match the list.

### 2026-10-04 · claude-opus-5-5 · branch `feature/changes-list`
Kept the table and turned it into a list of changes (`changes-table-view.js`). Columns: a change badge (`+ ~ −` on the diff colour) with a bpmn-font type icon, the element (name plus the id in grey when they differ; a connection is named by its ends), and "What changed" — the changed property groups from `nodeIdToDiffsMap`, "Type" first for `typeChangedIds`. The old Properties column (impl type / async flags, shown whether changed or not, written through `innerHTML`) is gone. Sequence and message flows are now listed; the counters show plain numbers instead of "N elements (M rows)". A row click selects the element and scrolls to it via `canvas.scrollToElement`, which also drills into a collapsed subprocess's plane. Rows sort by document order across the whole file (they used to sort by the main process only). Tests: `test/differ/bpmn/changes-table-view.test.js` (icon classes checked against `bpmn.css`), the changes-table e2e specs, and a new plane-switch e2e.
