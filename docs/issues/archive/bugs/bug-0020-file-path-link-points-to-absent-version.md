---
id: BUG-0020
title: Header file-path link stays clickable on a side where the file does not exist
priority: medium
status: done
---

## Statement

In an MR diff of a file that is new or deleted in the MR, after switching (via **Switch
branch**) to the side where the file does not exist — header shows
`Original · <label> · file does not exist` / `Changed · <label> · file deleted` — the
clickable file-path link ([FEAT-0026]) stays active. Clicking it opens a GitLab blob URL
at a ref where the file is absent and errors, e.g.
`"…/assignMeetingTasks.bpmn" did not exist on "<commit-sha>"`.

Expected: on a side with no file the path is plain (inactive) text, not a link.

## Context

- Regression from [FEAT-0026] (clickable file path in the differ header).
- Root cause: `#shownFileFor(targetSide)` built the blob URL based only on the presence
  of a `ref`, ignoring whether the file actually exists on that side. Existence is
  tracked by `DiagramVersions` — `branchXml` (target) / `mrXml` (source) are `null` when
  the file is absent. `#showAbsentSide()` therefore still passed a live URL to the view.
- Shared logic — fixed identically in both `bpmn-differ.js` and `dmn-differ.js`. The view
  (`setShownFile` → `differ-file-path-inactive`) already renders `url:null` as plain text,
  so no view/CSS change was needed.

## Work log

### 2026-06-21 · claude-opus-4-8 · branch `fix/file-path-link-absent-version`

Gated the header link URL on file existence in `#shownFileFor()` of both differs:
`url` is now built only when the side has both a `ref` and the file present
(`branchXml`/`mrXml`). On an absent side the path renders as inactive text. `npm test`
green (954 pass).
