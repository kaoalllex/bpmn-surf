---
id: UX-0010
title: "Show diff with local" as a dropdown next to the main schema/decision button
priority: low
status: open
---

## Statement

Today the repo single-file view injects **two side-by-side buttons**: the main
`Show schema` / `Show decision`, and a secondary `Show diff with local`
(created in `GitLabUIRepoProvider.addButton()` when `needToSelectLocalFile` is
true). The secondary button widens the button row and competes visually with the
primary action.

Make `Show diff with local` a **secondary action in a dropdown attached to the
main button** (a caret toggle next to `Show schema` / `Show decision` that opens
a small menu with a single item, e.g. `Diff with local file…`). The primary
action stays a plain click on the main button; the local-file flow moves under
the caret.

Behavior of the local-file flow itself must not change — only how it is reached.

## Context

- Split out from [UX-0009] (the `bpmn-surf` rebrand). It is a **behavioral/UX
  change** outside the rebrand's stated scope, so it is tracked separately, but
  it may ship in the **same MR and as its own commit** since both touch
  `src/content/providers/gitlab/gitlab-ui-repo-provider.js` and the new
  content-script style file introduced by [UX-0009].
- Affected code:
  - `gitlab-ui-repo-provider.js#addButton` — currently appends `button2`
    (`'Show diff with local'`, line ~49–54) as a sibling; the hidden `fileInput`
    (line ~41) and `#localFileSelected` stay as-is and are triggered from the
    new menu item instead.
  - `reset()` removes the whole `#buttonId` container, so the dropdown markup is
    cleaned up with it — **but** any document-level outside-click / `Esc`
    listener added to close the menu must be explicitly torn down in `reset()`
    to avoid leaks across GitLab SPA navigation.
  - `isOwnButtonClick()` keys off `event.target.id.startsWith(this.#buttonId)` —
    give the caret/menu/menu-item elements ids prefixed with `#buttonId`.
- Styling: put the dropdown CSS in the content-script style file introduced by
  [UX-0009] (the button lives in GitLab's DOM, not on the differ page).
- Watch for theme/CSS conflicts on the floating menu (z-index, absolute
  positioning inside GitLab's flex header).

### Relations

- [UX-0009] — the `bpmn-surf` rebrand; this task was split out of it and may
  share its MR.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
