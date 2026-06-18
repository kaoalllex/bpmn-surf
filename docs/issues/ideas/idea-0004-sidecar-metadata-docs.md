---
id: IDEA-0004
title: Sidecar metadata/docs for a schema (stored next to the .bpmn in git)
priority: low
status: open
---

## Statement

Supplementary descriptive information for a schema — documentation of the working
logic, explanatory/accompanying notes — stored as a **separate file in git next
to the `.bpmn`/`.dmn`** (a sidecar), and surfaced when browsing the schema.

Key constraints:

- **Lives alongside, but separate.** It does **not** override or replace the
  native schema comments (`bpmn:documentation` / annotations embedded in the
  XML) — it is a parallel layer.
- Git-native, no backend — fits the extension's no-server model. Versioned and
  diffed together with the schema.
- Primary purpose: describe *how the logic works* / accompanying info for readers
  browsing the schema (the browsing-first direction). May also serve discussions
  during work on a schema — though MR review comments fit that better, see
  [IDEA-0002].

## Context

- ⚠️ **Distinct from [IDEA-0002].** IDEA-0002 = review comments on an MR, anchored
  to the relevant element on the schema and backed by the GitLab comments
  mechanism (a reviewer leaves a comment on the diagram, it becomes a GitLab MR
  comment, positioned at the element it refers to). This idea (IDEA-0004) =
  durable documentation/metadata about the schema itself, stored as a git
  sidecar, independent of any MR.
- Open questions before this is more than an idea:
  - File naming/format convention (e.g. `foo.bpmn` → `foo.bpmn.meta.json` /
    `.md`?), and how it is associated back to elements (by element id?).
  - Merge behavior / conflict handling when the schema and its sidecar change
    together.
  - How it renders in the viewer without clashing with native
    `bpmn:documentation`.
- Part of the broader browsing-first shift — see [UX-0009] (rebrand to
  `bpmn-surf`).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
