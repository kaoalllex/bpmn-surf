---
id: BUG-0045
title: Edit mode drops the outline of a subprocess that contains a change
priority: medium
status: done
---

## Statement

In the diff view a subprocess that contains an added, removed or changed element gets
the CHANGE stroke ([BUG-0010]). Edit mode lost that sign. This happened both for the MR
diff it shows as colour layer 3 and for the user's own edits inside a subprocess. A
collapsed subprocess with an edit inside therefore looked untouched.

## Context

`BpmnDiffer#paintDiffs` paints `subProcessWithChangesIds` in view mode only. In edit mode
the diff goes to `EditSession.setMrDiff`, and the session's own recompute builds its
layers the same way. Both took only the missing/changed ids. Found while recording the
store screenshots on the demo project (`4-edit-mode.png`: "Reserve stock" had no outline).

## Work log

### 2026-10-03 · claude-opus-5-5 · branch `fix/differ-polish`

- `EditSession` adds a stroke-only layer of `subProcessWithChangesIds` to both the MR
  layers and its own.
- `EditColorResolver` ranks stroke-only layers below every fill layer and carries
  `strokeOnly`.
- `EditDiffPainter` marks such elements `edit-diff-changed-stroke`, which `styles.css`
  styles as the CHANGE row colour on the stroke and the label.
- `EditXmlColorizer` exports them as `border-color`.
- Tests: `differ-edit-subprocess.spec.js` covers the MR change and my own edit, and the
  resolver, painter and colorizer have unit tests. All were seen failing without the fix.
