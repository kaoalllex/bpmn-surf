---
id: BUG-0030
title: Outline markers (☼ highlight, search, edit diff) stopped rendering after the bpmn-js upgrade
priority: high
status: done
---

## Statement

In the BPMN differ the diff highlight button (☼) had no visible effect: clicking it
flipped the icon to ☀ and the `highlight-diff-pulse` / `highlight-diff` markers were
added to the elements, but nothing changed on the canvas. No exception, no unhandled
rejection — the differ flow ran to the end.

The same breakage silently hit every other outline-based marker: search matches
(`search-match`, `search-match-current`, [FEAT-0006]), the thick outline of the row
selected in the changes table (`highlight-diff-big`) and the edit-mode diff outline
(`edit-diff-outline`, [FEAT-0031]).

## Context

Root cause: `1cce3a9` (this branch) upgraded bpmn-js 18.18.0 → 18.25.1. In the
diagram-js it carries (15.17 → 15.24), the `outline` module no longer creates the `.djs-outline`
child eagerly:

- before — `eventBus.on(['shape.added', 'shape.changed'], …)` created the outline for
  every rendered element;
- after — it is created only on `element.hover` and `selection.changed`; the
  `shape.changed` / `connection.changed` handler merely *updates* an outline that
  already exists.

Every `.highlight-diff*`, `.search-match*` and `.edit-diff-outline` rule in
`src/differ/styles.css` is scoped to `.djs-element.<marker> .djs-outline`. With no
`.djs-outline` node the markers had nothing to style, so `canvas.addMarker` succeeded
and the user saw nothing.

Fix: `BpmnDiffer#keepOutlinesRendered` (`src/differ/bpmn/bpmn-differ.js`) subscribes
to `shape.added` / `connection.added` and calls `outline.createOutline(element)`,
restoring the pre-upgrade eager creation for all three marker families at once.

Why it was not caught: the e2e highlight specs assert marker *classes* only
(`differ-highlight.spec.js`), which stay correct while the rendered outline is gone.
`differ-highlight.spec.js` now also asserts the rendered `.djs-outline` and its
computed stroke — see also [REFAC-0015] on assertions that cannot fail.

Unrelated but ruled out during the investigation: the uncommitted [INFRA-0001] work
(minified dmn-js and properties panel) does not touch this path.

## Work log

### 2026-08-30 · claude-opus-5 · branch `feature/feat-0031-bpmn-edit-mode`

Found the root cause by diffing the bundled diagram-js `outline` module across the
`1cce3a9` upgrade. Reproduced in the real browser with a new Playwright case
(`.djs-outline` resolved to 0 elements), fixed it with the eager-creation
subscription, and re-ran both suites: 1175 unit tests, 138 e2e tests, all green.
