---
id: INFRA-0011
title: Extend the live-check skill's catalog to the whole extension
priority: medium
status: partial
---

## Statement

The `live-check` project skill (`.claude/skills/live-check/SKILL.md`) lets any
session run a hands-on check of the real extension on the sandbox. Its catalog
covers only some areas (one file per area in `.claude/skills/live-check/catalog/`, indexed
from the skill's "Catalog" table). Add the other areas, each as its own file there, with:
- concrete steps;
- the sandbox material it needs, created through the API;
- what the harness can assert and what has to be eyeballed from screenshots.

The areas to add:
- differ highlighting (BPMN and DMN);
- the changes table;
- the properties panel;
- switch branch;
- navigation — partly covered: "Differ navigation" (`record-demo.mjs --no-video` on the
  demo project) walks dive-in, back to the parent, the callers list, the decision
  badge, handler and correlation badges. Not yet: opening a caller from that list (the
  call site selected), and the sandbox's traps (prefix topics, duplicate classes,
  no-code topics);
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
- The skill now routes differ-only changes to the Layer-2 specs (they run the real
  bpmn-js and properties panel offline), so for the differ areas above a live entry
  should only cover what reaches GitLab at run time: file fetching, blob search
  (handler badges, correlation), the dive-in file lookup, switch branch.
- Related: [INFRA-0008] (automated Layer-3 e2e), which would move part of this
  into CI.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-10-05 · claude-opus-5-5 · branch `release/v1.3.0`

`record-demo.mjs --no-video` walks the demo tours without recording, and the skill
gained a "Differ navigation" section (signed in: code search is mocked offline) and a
"Release smoke" set run before every release and store submission; `/release` points
to it. The navigation area is partly covered by that; the rest is listed above.

### 2026-09-27 · claude-opus-5-5 · branch `fix/loop-characteristics-panel-highlight`

Reviewed the skill on a differ-only fix (BUG-0042): the catalog had nothing for it and
no pointer to where such a change is checked. Added the "does this change need a live
run?" routing section; the change itself was verified by a new Layer-2 case in
`differ-edit-prop-group.spec.js`. The catalog is still buttons-only.
