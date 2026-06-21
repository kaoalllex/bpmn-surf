---
id: FEAT-0008
title: Open the commit of the shown version in GitLab
priority: low
status: open
---

## Statement

Open the **commit** of the currently shown version in a new GitLab tab — the commit
page itself (`/-/commit/<sha>`): its message, author/date and the whole set of changes
across all files, not just this diagram.

Anchor the affordance to the version indicator in the differ header (the
`Original · <ref>` / `Changed · <ref>` / `Local · <name>` element) — either a small
`[Open]` / ↗ button next to it, or by making the indicator itself a link. The
`Branch:` label this task originally referenced was removed in [FEAT-0026], so there
is no longer a separate "Branch field" to put the button beside.

Use the ref (sha) of the side currently shown (`targetRef` for Original, `sourceRef`
for Changed). Skip/disable it for the `Local` side — a local file has no commit.

## Context

- **Distinct from [FEAT-0026]:** clicking the file path already opens the *file* at the
  shown ref (`/-/blob/<ref>/<path>`). This task opens the *commit* (`/-/commit/<sha>`) —
  the change-set overview, a different target. The two complement each other; FEAT-0026
  covered the main "jump to this file in GitLab" need, which leaves this as an optional
  extra (hence the low priority).
- A `commitUrl(ref)` helper in `src/differ/shared/differ-params.js` (next to
  `rawFileUrl` / `blobFileUrl`) would build the URL the same way.
- Example link: https://gitlab.example.com/example-group/example-service/-/commit/85c64b3ed8c345ddd9f27f614f70a0e5136b5873

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries at the top (most recent first). -->

### 2026-06-21 · claude-opus-4-8 · branch `feature/feat-0026-clickable-file-path`

Actualised the description only (not implemented). Clarified that this opens the commit
page (`/-/commit/<sha>`), which is distinct from [FEAT-0026]'s file-blob link; re-anchored
the affordance from the now-removed `Branch:` label to the version indicator; noted a
`commitUrl(ref)` helper. Kept priority `low` — FEAT-0026 covers the primary navigation need.
