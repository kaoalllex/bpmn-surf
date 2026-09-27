---
id: INFRA-0011
title: Extend the live-check skill's catalog to the whole extension
priority: medium
status: open
---

## Statement

The `live-check` project skill (`.claude/skills/live-check/SKILL.md`) lets any
session run a hands-on check of the real extension on the sandbox. Its catalog
covers only the MR and branch-view buttons. Add the other areas, each with:
- concrete steps;
- the sandbox material it needs, created through the API;
- what the harness can assert and what has to be eyeballed from screenshots.

The areas to add:
- differ highlighting (BPMN and DMN);
- the changes table;
- the properties panel;
- switch branch;
- navigation (dive-in, handler badges, correlation, back);
- search;
- edit mode;
- the popup (hosts, settings);
- report-a-problem.

## Context

- Created alongside the per-file diff button work (branch
  `fix/per-file-diff-button`), where the skill and its first area were written.
- The harness scripts live in `test/e2e/live/`. Offline differ checks already
  exist as Layer-2 specs (`docs/testing.md`). The catalog should point to those
  instead of duplicating them, and keep to what only a live run shows.
- Related: [INFRA-0008] (automated Layer-3 e2e), which would move part of this
  into CI.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
