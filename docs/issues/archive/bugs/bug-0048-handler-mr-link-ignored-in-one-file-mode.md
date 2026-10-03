---
id: BUG-0048
title: A changed handler's MR link shows the wrong file in "one file at a time" mode
priority: medium
status: done
---

## Statement

The blue `</>` badge of a handler changed in the MR navigates the MR tab to that file's
diff. On gitlab.com with "Show one file at a time" on, the MR tab kept showing the file
it already had, or the MR's first file on a fresh load. The handler's diff was not
shown.

## Context

`HandlerLocator#mrFileDiffUrl` built `…/diffs#<sha1(path)>`. Measured live on the demo
project:
- rapid diffs in one-file mode ignores the bare anchor, both on a fresh load and on a
  same-document hash change;
- the legacy UI honours it;
- GitLab's own file-tree links are `?file_path=<path>#<sha1(path)>`, and with that query
  both UIs show the file in one-file mode and scroll to it in all-files mode.

## Work log

### 2026-10-04 · claude-opus-5-5 · branch `fix/nested-handler-opener`

- `mrFileDiffUrl` adds `?file_path=<path>` before the anchor. The query also turns the
  MR tab's navigation into a real one, where a hash-only change was a no-op.
- `differ-handler-badge-click.spec.js` and `differ-handler-badge-opener.spec.js` now
  expect the exact URL. Both failed before the change.
- Checked live: Payment (dived into from OrderMain) → blue `</>` → the MR tab shows
  `ChargeCustomerHandler.kt`.
