---
id: IDEA-0002
title: Comments on diagram elements
priority: low
status: open
---

## Statement

Leave review comments on BPMN elements right on the schema during an MR review:
while reviewing, the user adds a comment directly on the diagram (e.g. "this
doesn't look right"), and it is created as a **GitLab MR comment**. Those comments
are then shown on the schema **anchored to the element they refer to** (positioned
at the right place), not in a flat list.

## Context

- ⚠️ **Distinct from [IDEA-0004]** (sidecar metadata/docs stored in git next to
  the schema). This idea = transient MR-review comments backed by GitLab,
  positioned on the diagram; IDEA-0004 = durable documentation living as a git
  sidecar, independent of any MR.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
