---
id: FEAT-0026
title: Clickable file path in the differ header — open the file in GitLab
priority: medium
status: done
---

## Statement

In the differ page header the file is shown only by its base name (`File: <name>`),
with no way to see **where** the diagram lives in the repository or to **jump** to
it. This hurts in two situations:

1. **Orientation.** After several dive-in steps (Call Activity / Business Rule
   Task → called DMN, see [FEAT-0023], [FEAT-0005]) it is no longer clear which
   part of the codebase the currently shown diagram belongs to.
2. **Navigation.** Sometimes you need to go straight to the file in the repo / MR.

Solve both at once: replace the base-name label with a **path-showing, clickable**
element — show the file path (truncated, full path on hover) and make clicking it
open the file in GitLab for the **currently shown side**.

Two product decisions taken up front:

- **Affordance:** a clickable path that replaces `File: <name>` (covers orientation
  *and* navigation without adding new toolbar chrome).
- **Link target (incl. MR mode):** the GitLab **blob URL built from the ref (sha)**,
  i.e. `/-/blob/<ref>/<path>`. A blob URL with the MR head commit sha shows the file
  exactly in the MR version, so a single universal construction is correct in all
  modes (MR diff / branch view / dive-in). No MR-diff anchor (`#sha1(path)`) is
  built — that would need async `crypto.subtle` per click and was deliberately
  rejected for this scope.

## Context

Affected files (the differ header is **duplicated** across the two differs — change
both in sync, per the shared-differ-page rule in CLAUDE.md / docs/conventions.md):

- `src/differ/shared/differ-params.js` — URL helpers + per-side data; already holds
  `platform.projectUrl`, `sourceRef`/`targetRef` (sha values, not branch names),
  `filePath`/`targetFilePath`, `changeRequestId`, and the existing
  `rawFileUrl(ref, filePath)` (`differ-params.js:67`).
- `src/differ/bpmn/bpmn-differ-view.js` + `src/differ/dmn/dmn-differ-view.js` —
  header rendering (`#createHeader`), the file-name span (`#fileNameSpan`,
  `bpmn-differ-view.js:297`) and `setFileName(...)` (`bpmn-differ-view.js:187`).
- `src/differ/bpmn/bpmn-differ.js` + `src/differ/dmn/dmn-differ.js` — orchestrators
  that drive the view; they already call `setFileName(...)` on init and on every
  branch switch (`bpmn-differ.js:352/380/400`) and own the shown-side decision via
  `branchIndicator.isTargetBranchShown()` (`bpmn-differ.js:320`).
- `src/differ/styles.css` — `.differ-file-name` / `.differ-toolbar` styles
  (`styles.css:127`, `:161`).

Related tasks: [FEAT-0020] (open XML source at element), [FEAT-0023] / [FEAT-0005]
(dive-in / back navigation that makes orientation matter), [FEAT-0008] (open
branch/commit). Behaviour of the download button is **not** changed.

### Plan

**1. `DifferParams` (`src/differ/shared/differ-params.js`).** Add a helper next to
`rawFileUrl`:

```js
blobFileUrl(ref, filePath = this.filePath) {
    return `${this.platform.projectUrl}/-/blob/${ref}/${filePath}`;
}
```

Unit tests (many small ones, public API only): plain path, nested subdirs, segment
encoding if applicable.

**2. View (`bpmn-differ-view.js` + mirror in `dmn-differ-view.js`).**

- `#fileNameSpan` (`<span>`) → an `<a class="differ-file-path">` (real `href`, so
  ctrl/middle-click open a new tab; plain click also opens a new tab via
  `target="_blank"`).
- Text = the file path, truncated **from the left** via CSS (`overflow:hidden;
  white-space:nowrap; text-overflow:ellipsis` + `direction:rtl` with a direction
  marker so the slashes are not reversed), so the base name stays visible; full path
  in `title`. The file group gets `flex:1; min-width:0` so it can shrink.
- Generalise `setFileName` → `setShownFile({ path, fileName, url })`: updates the
  text (path), `title`, and `href`. If `url` is empty (local file / a side with no
  repo ref) render it as an inactive `<span>` (no link).

**3. Orchestrator (`bpmn-differ.js` + mirror in `dmn-differ.js`).**

- At the three call sites that currently call `setFileName(...)` (init + switch),
  pass the whole shown side: for target — `targetRef` / `targetFilePath` /
  `targetFileName`; for source — `sourceRef` / `filePath` / `fileName`; build `url`
  via `params.blobFileUrl(ref, sidePath)`.
- If the shown side has no repo ref (e.g. `localFileContent` without `sourceRef`)
  pass `url: null` → inactive path.

**4. CSS (`src/differ/styles.css`).** Add `.differ-file-path` (inherits the size
from `.differ-file-name`, link colour only on hover/focus, left-truncation).

**5. Docs / task.** Update this task on completion (status + Work log per
`docs/issues/README.md`); update docs only if anything architectural changes.

Scope: small–medium, isolated; both differs touched in sync. Download behaviour
unchanged.

## Work log

<!-- Each AI session on the task — a separate entry by the template above.
     Add new entries on top (freshest first). -->

### 2026-06-21 · claude-opus-4-8 · branch `feature/feat-0026-clickable-file-path`

Implemented per the plan, both differs in sync:

- `differ-params.js` — added `blobFileUrl(ref, filePath)` next to `rawFileUrl`
  (`/-/blob/<ref>/<path>`). Covered by unit tests (default path, explicit path,
  nested path, sha-built URL).
- `bpmn-differ-view.js` + `dmn-differ-view.js` — the `#fileNameSpan` `<span>`
  became an `<a class="differ-file-path">` (real `href`, `target=_blank`,
  `rel=noopener`); `setFileName(name)` → `setShownFile({ path, fileName, url })`,
  which sets the left-truncated path text (LRM-prefixed so the slashes are not
  reordered in the rtl element), the `title` (full path), and the `href`. An
  empty `url` removes the href and marks the path inactive (non-link).
- `bpmn-differ.js` + `dmn-differ.js` — new `#shownFileFor(targetSide)` builds the
  `{ path, fileName, url }` for the shown side (target → `targetRef`/`targetFilePath`,
  source → `sourceRef`/`filePath`; `url:null` when that side has no repo ref, e.g.
  a local file). Wired at the three `setFileName` call sites (absent-side switch,
  show-branch, show-mr).
- `styles.css` — replaced the orphaned `.differ-file-name` with `.differ-file-path`
  (left-truncation via `direction:rtl`+ellipsis, link colour only on hover/focus)
  and `.differ-file-group` (`flex:1; min-width:0` so the path can shrink).

`npm test` green (950 tests). Download behaviour unchanged. No manifest changes.

Review follow-up (same session): per UX feedback, dropped the `File:` and
`Branch:` labels (the path and the branch indicator are self-explanatory), and
removed `flex:1` from the file group/path so the path no longer reserves/grows
space — it only shrinks (left-truncates) when its line is tight. The flexible
slack now lands on the existing spacer before "Switch branch", so the download
button and branch indicator stay on the left with an empty gap before "Switch
branch". Verified the layout in a browser mock across widths. Orphaned
`.differ-label` CSS rule removed.

Second review follow-up (same session): moved the download button to the LEFT of
the path (stable position by the bar edge; the path truncates after it). Made the
branch indicator self-explanatory after dropping the "Branch:" label: the role
word now always prefixes the label, so a plain file view shows `Original · <ref>`
instead of a bare sha. Added a `Local` source role — "Diff with local" now shows
`Original · <ref>` / `Local · <uploaded file name>` (BranchIndicator gained an
`isLocalSource` flag, both differs pass `!!localFileContent`; the UI provider sends
`file.name` as `sourceLabel` instead of the static `'local file'`). FEAT-0008
(open the commit) deliberately left as a separate task. Tests updated/added
(954 green), layout re-verified in the browser mock.
