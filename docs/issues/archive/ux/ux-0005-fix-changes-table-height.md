---
id: UX-0005
title: Fix the height of the changes table
priority: medium
status: done
---

## Statement

Make the changes panel scroll independently and fix its height, to avoid shifting when large property panels are opened.

## Context

- Independent scroll of the changes panel; avoid shifting when large property panels are opened.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-10-04 · claude-opus-5-5 · branch `feature/changes-list`
The independent scroll and the props-panel shift were already fixed by [BUG-0021]. What remained was the max-height: Switch branch changes the row count, so the canvas resized with it. The list now has a fixed 250px height (`bpmn-differ-view.js#createFooter`); `differ-layout-geometry.spec.js` asserts it. Done together with [REFAC-0006].
