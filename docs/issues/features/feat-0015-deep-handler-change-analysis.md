---
id: FEAT-0015
title: Deep analysis of handler changes (transitive dependencies)
priority: low
status: open
---

## Statement

Currently an element is highlighted as "handler changed in this MR" only if the **handler class file itself** changed (`handler-locator.js#findChangedHandlers` scans only the files from the MR diff). If the handler's logic changed in a file that it imports/uses (a transitive dependency), the change is not detected and no badge appears.

We need to account for changes in the transitive dependencies of the handler class, not just in the file itself.

## Context

- Split off from [FEAT-0003] (it was item 3, "deep analysis"); the basic highlighting/code opening is there and in [FEAT-0004].
- Affected file: `src/differ/navigation/handler-locator.js` (`findChangedHandlers`, lines 128-150 — the point where currently only the handler file itself is flagged; see the note comment in the file header).
- Open implementation questions (to resolve when picked up):
  - How to build the dependency graph without a local checkout of the repository? Parsing `import`s from file contents + resolving via the GitLab blob-search/tree API — potentially many requests.
  - Traversal depth (1 level / N levels / transitively to a fixed point) and protection against cycles.
  - Where to stop so as not to scan half the repository (filters by package/module, limits).
  - Performance and caching: the "class → file" resolution is already cached in the locator; cache the dependency graph similarly.
- Low priority: an expensive feature with an unclear benefit/cost ratio; do it after the basic support for delegates and Java from [FEAT-0003]/[FEAT-0004].

## Work log

<!-- Each AI session on the task is a separate entry per the template below.
     Add new entries at the top (freshest first). -->
