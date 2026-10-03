---
id: BUG-0043
title: Switch branch leaves the drilled-into subprocess for the root process
priority: medium
status: done
---

## Statement

After drilling into a collapsed subprocess in the BPMN differ, "Switch branch" shows
the other version's root process instead of the same subprocess in that version, so
comparing a subprocess's contents meant drilling in again after every switch.

## Context

- Every switch re-imports the other version's XML (`BpmnDiffer#showXml`); the import
  resets the canvas to the process root. The selection was carried over, the root
  plane was not.
- Found while checking [BUG-0010] on the sandbox (MR !15, `QesApplication.bpmn`).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-10-03 · claude-opus-5-5 · branch `fix/bug-0010-subprocess-highlight`

Reproduced live on sandbox MR !15 (drill into `Sign UZ`, Switch → breadcrumbs back at
the root). `BpmnDiffer#showXml` now records the current root and viewbox before the
import and `#restoreDrilledRoot` re-enters that plane afterwards when the shown version
has it (same viewbox); otherwise the view stays on the process root. The root process
is fitted before re-entering, so going back up via the breadcrumbs lands on a fitted
diagram rather than on the subprocess's coordinates. Layer-2: two cases in
`differ-switch-branch.spec.js` (stays in the plane both ways; falls back when the other
version lacks the subprocess). Live re-check after the fix: stays in `Sign UZ` across
both switches, breadcrumbs up → fitted root.
