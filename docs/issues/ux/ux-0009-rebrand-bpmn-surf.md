---
id: UX-0009
title: Rebrand the project to "bpmn-surf" (browsing-first identity)
priority: medium
status: open
---

## Statement

Rebrand the project from "BPMN Diff" to **`bpmn-surf`**, reflecting the shift in
emphasis from "MR diff tool" to a **schema browsing/exploration tool** (analyze
schemas stored in a repo, read handler code, dive into call activities and back —
see [FEAT-0023] — navigate to called DMN — see [FEAT-0005]). MR diff stays the
primary mode, but is no longer the whole product.

Scope of the rename:

- Repository / project name and the public README (mind the planned move to a
  public GitHub repo — pick a name and identity that travel to an English /
  open-source audience).
- `manifest.json` extension `name` / `description` / store-facing copy.
- User-visible strings and the injected GitLab button label(s) where the old
  "Diff" framing no longer fits.
- Docs: `CLAUDE.md`, `docs/*.md` headers and prose that name the project.
- Internal identifiers/paths only where cheap and safe — do **not** churn code
  paths for cosmetics; behavior must not change.

Brand identity (folded in from the original UX-0009 scope):

- A single accent brand color/tone across the project. An accent style for the
  injected GitLab button ("Show schema diff" / "Show decision diff") so it is
  distinguishable from native GitLab buttons, while keeping the native button
  shape (size, rounding, placement). Scope — accent color via a dedicated CSS
  class, no full style override (theme-conflict risk). Coordinate the tone with
  the accent already used by `differ-update-indicator`
  (`hsl(212, 73%, 46%)` in `src/differ/styles.css`).

## Context

- Decision (2026-06-18): the chosen name is **`bpmn-surf`**. The alternative
  "CamOD / Camunda Operator Desktop" was set aside — it overcommits to a specific
  vendor (Camunda) and to a runtime/operator role the tool does not have today.
  That direction is captured separately as a prod-operator idea — see [IDEA-0003].
- The injected button is created in `GitLabUIRepoProvider.addButton()`
  (`src/content/providers/gitlab/gitlab-ui-repo-provider.js`). Labels:
  - `'Show schema diff'` (BPMN), `'Show decision diff'` (DMN) — line ~92;
  - `'Show diff with local'` — line ~52.
- Content-script styles vs differ-page styles: the injected button lives in
  GitLab's DOM, not on the differ page — make sure the accent CSS lands in the
  correct style scope.
- This is a multi-touch change (repo, manifest, docs, store copy); the actual
  rename work may warrant splitting into an INFRA sub-task when picked up.

### Open questions

- Apply the button accent to all three labels or only the main "Show schema /
  decision diff" (not "Show diff with local").
- Where to keep the content-script button CSS (a separate content style file?)
  so it does not depend on differ-page styles.

### Relations

- [FEAT-0023] — back navigation; [FEAT-0005] — navigate to called DMN. Part of
  the same browsing-first shift this rebrand reflects.
- [IDEA-0003] — the CamOD / prod-operator direction (separate product scope).
- [UX-0006] — archived; a different button (Highlight on the canvas), listed
  only to avoid confusion.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
