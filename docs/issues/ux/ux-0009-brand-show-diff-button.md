---
id: UX-0009
title: Accent (branded) style for the "Show schema diff" button in GitLab
priority: low
status: open
---

## Statement

The button injected into the GitLab interface to open the differ is currently indistinguishable from
the native GitLab buttons — the user does not notice it. Make it **noticeable through
an accent brand color/outline**, while preserving the shape of the native
GitLab button (size, rounding, placement).

Scope — **accent color only** (a dedicated CSS class): no icon/logo and no
full style override, to minimize the risk of conflict with GitLab
themes. The icon/logo — potentially a separate task.

## Context

- The button is created in `GitLabUIRepoProvider.addButton()`
  (`src/content/providers/gitlab/gitlab-ui-repo-provider.js`). Labels:
  - `'Show schema diff'` (BPMN), `'Show decision diff'` (DMN) — line ~92;
  - `'Show diff with local'` — line ~52.
- Currently only native GitLab classes are attached
  (`gl-button btn btn-default gl-rounded-base gl-bg-gray-50` …), the button has **no** styles
  of its own — there is room to add an accent.
- ⚠️ This is a **different** button, not to be confused with the archived [UX-0006] (blinking of diff elements
  on the canvas via the Highlight button). Here it is the button injecting the differ on
  the GitLab MR/repo page.
- Content script styles vs differ page styles: make sure the button's class lands
  in the correct style scope (the button lives in GitLab's DOM, not on the differ page).
- Coordinate the color with the accent already in use (`differ-update-indicator`
  uses `hsl(212, 73%, 46%)` in `src/differ/styles.css`) — for a single
  brand tone across the project.

### Open questions

- Apply the accent to **all three** labels or only to the main "Show schema/
  decision diff" (not to "Show diff with local").
- Where to put the CSS for the content script button (a separate content style file?),
  so as not to depend on the differ page styles.

### Relations

- [UX-0006] — a different button (Highlight on the canvas), only so as not to confuse them.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
