---
id: BUG-0001
title: Diff error for a file deleted in both the MR and master
priority: high
status: done
---

## Statement

The MR is closed but is detected incorrectly, and the file is deleted in both branches → the attempt to load from master fails with a 404, and the diff is not built.

## Context

- MR: https://gitlab.example.com/example-group/example-service/-/merge_requests/3082/diffs#b0f241e6a57a97ab996588742c2f9197941f9250 (file `assignMeetingTasks.bpmn`)
- Symptoms: log `MR is not merged. Target commit id is target branch name: master`; then:
  ```
  404 (Not Found) — loading mr bpmn xml
  404 (Not Found) — showing branch bpmn xml file
  Uncaught (in promise) Error: branchBpmnXml is undefined
      at requireDefined (utils.js:56:15)
      at showBpmnBranch (bpmn-differ.js:582:5)
      at showBpmnDiff (bpmn-differ.js:2007:15)
  ```
- Related to the task about deleted/new schemas → [UX-0003]; **implement together** —
  [UX-0003] holds a detailed plan (including the "both sides absent" case) and the results
  of the codebase investigation on points with files/lines.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (freshest first). -->

### 2026-06-16 · claude-opus-4-8 · branch `feature/ux-0003-absent-schemas`

Resolved jointly with [UX-0003] (shared code for the "one/both sides absent" path). When both sides
are empty, the orchestrators (`bpmn-differ.js`, `dmn-differ.js`), instead of an early `return` with an empty white
screen, call `view.showEmptyState('File not found in either version')` — a `DifferEmptyState` placeholder
inside the canvas cell (the toolbar with Close/Download stays available). There is no crash on `requireDefined`
(the early exit fires earlier). Implementation details and the file list — in the [UX-0003] log.

`npm test` is green. The DOM check for both empty sides — via the manual checklist.
