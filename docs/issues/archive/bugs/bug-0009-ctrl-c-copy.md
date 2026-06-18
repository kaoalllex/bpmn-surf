---
id: BUG-0009
title: Ctrl+C (copy) doesn't work
priority: low
status: done
---

## Statement

Some handler blocks copying — restore the browser's standard behavior.

## Context

The bug concerned copying from the differ's **properties panel**. The root blockage was
removed as part of [BUG-0014] (properties-panel fields stay selectable and
copyable while the editing ban is preserved via a `beforeinput` veto);
the adjacent canvas case was closed in [BUG-0015]. The user confirmed that
copying from the properties panel works.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (freshest first). -->

### 2026-06-18 · claude-opus-4-8 · branch `master`

Relevance verified. There is no handler in the code that unconditionally swallows
`Ctrl/Cmd+C`: all interceptions are narrowly specialized (`Ctrl+F` — search, `Ctrl+Wheel` —
zoom, `beforeinput` veto — editing only, not copying). The real
blockage of copying from the properties panel was removed in [BUG-0014]. The user
confirmed that copying from the panel works. Closed as `done`.
