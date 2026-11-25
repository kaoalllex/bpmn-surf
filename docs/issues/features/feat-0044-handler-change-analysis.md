---
id: FEAT-0044
title: Tell how a handler changed, not only that it changed
priority: low
status: open
---

## Statement

The differ already marks a task whose handler code (Java delegate, external-task or job
worker) changed in the merge request, and links to the handler's diff. Every such change
looks the same, whether it is a reformatting or a new required variable. A handler-code
analyzer for the findings core of [FEAT-0040] reads the handler's two versions and reports
*how* it changed, each kind with its own level in the profile.

Candidate finding kinds (to be narrowed during design):

- only formatting, comments or imports changed — Minor;
- the process variables the handler reads or writes changed (names added/removed) — Critical;
- BPMN errors it throws (error codes) changed — Critical;
- the handler class / bean / topic registration changed — Critical;
- other logic changed — Normal (today's badge).

Requirements:

1. Runs in the background (handler files are fetched from the user's own GitLab/GitHub),
   merging its findings when ready, as the current badge does; a failure is a visible status.
2. Static, local analysis of the source text; no code is executed and nothing is sent to a
   third party.
3. When the analysis cannot classify a change, it falls back to today's "handler changed".

Out of scope: following the handler's own dependencies — [FEAT-0015]; languages other than
Java at first.

## Context

- Today: `src/differ/navigation/handler-locator.js#findChangedHandlers` (files of the merge
  request diff), `handler-navigator.js` (badges, link to the diff), started in the background
  by `BpmnDiffer#loadChangedHandlers`. [FEAT-0040] step 3 turns this into the first
  background analyzer; this task deepens it.
- Variable access patterns to recognise: `execution.getVariable("…")` /
  `setVariable`, `externalTask.getVariable`, Camunda 8 `job.getVariablesAsMap()` /
  `@Variable` annotations, `@JobWorker(fetchVariables = …)`; error codes via `BpmnError`.
- Related: [FEAT-0032] (the variable contract of a call activity) can reuse the
  "variables read/written" extraction.

## Work log

<!-- Each AI session on the task — a separate entry by the template below.
     Add new entries on top (freshest first). -->
