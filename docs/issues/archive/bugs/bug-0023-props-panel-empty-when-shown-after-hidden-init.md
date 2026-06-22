---
id: BUG-0023
title: Properties panel renders empty when shown after being hidden at load time
priority: medium
status: done
---

## Statement

When the properties panel is hidden at the moment the differ page loads, clicking
**Show properties** reveals the panel's space but it stays **empty** — no header,
no groups.

Reported repro (dive-in path):

1. Open a diagram for viewing, hide the properties panel (**Hide properties**).
2. On the same diagram, dive into a Call Activity → the called diagram opens with
   the panel already hidden (correct — the choice persists via [BUG-0018]).
3. On the child diagram click **Show properties** → the panel slot appears but is
   empty.

Counter-case (works): if the panel is **shown** on the root diagram and you dive
into the Call Activity, the child diagram's panel works correctly.

The dive-in is incidental. The actual condition is **"panel hidden at page load"**:
the same empty panel appears after a plain reload of a diagram whose panel was
hidden (the hidden state is persisted globally in `localStorage`, see [BUG-0018]).

## Context

### Root cause

`src/differ/bpmn/bpmn-differ.js`, `#setPropertiesPanelContainerMaxHeight()` (line ~760):

```js
panelContainer.style.maxHeight = panelContainer.offsetHeight;
```

This runs unconditionally during `show()` (line ~205), after the bpmn-js
properties-panel module has rendered `.bio-properties-panel-scroll-container`.

- When the panel is **hidden at load** (`display:none` is applied to the props
  cell in `BpmnDifferView#restorePropsHidden()` before the modeler is created),
  the scroll container exists in the DOM but its `offsetHeight` is **0** (an
  ancestor is `display:none`). The assignment becomes `style.maxHeight = 0`, i.e.
  the CSS `max-height: 0` — a valid zero length — which collapses the scroll
  container. Later **Show properties** restores `display` on the cell, but the
  stale inline `max-height: 0` remains, so the content stays clipped → empty panel.
- When the panel is **visible at load**, `offsetHeight` is a positive number and
  the assignment is `style.maxHeight = "600"` (no unit). A unitless non-zero
  length is invalid CSS and is silently ignored, so the panel renders normally.
  In other words this line "works" only by being a no-op in the visible case; it
  actively breaks the hidden case.

The panel DOM itself is rendered correctly by the library regardless of `display`
(bpmn-js-properties-panel renders declaratively on the `root.added` event into its
own `_container`); the only thing that hides the content is the `max-height: 0`.

### Why it surfaced now

The `max-height` line is legacy (predates the differ refactor). It only became a
problem once [BUG-0018] made it possible for the panel to be hidden at page-load
time (persisted choice). It was latent before because the panel was always visible
on first load.

### Fix direction (not yet implemented)

Don't apply a `max-height` measured while the panel is hidden. Options:

- Guard: only set it when `panelContainer.offsetHeight > 0`, and append the `'px'`
  unit so it is valid CSS; **or**
- Drop the line entirely if it is no longer needed — `propsInner` (the
  `PROPS_ID` cell's inner div) already has `overflow-y: auto`, and [BUG-0021]
  reworked scrolling so the tall panel scrolls inside its cell. Verify the
  scrollbar behaviour [BUG-0021] addressed still holds without this line before
  removing it.

Whichever path is chosen: re-check the [BUG-0021] scenario (tall props panel must
scroll inside its cell, footer stays visible) and the shared differ-page classes
are not affected (DMN differ uses its own panel, but confirm no regression).

### Affected files

- `src/differ/bpmn/bpmn-differ.js` — `#setPropertiesPanelContainerMaxHeight()`
  (line ~752-761), called from `show()` (line ~205).

### Related tasks

- [BUG-0018] — props-panel visibility persistence (introduced the hidden-at-load
  condition that exposes this bug).
- [BUG-0021] — tall props panel scrolling inside its cell (interacts with the
  `max-height` / overflow behaviour; verify after the fix).

## Work log

<!-- newest first -->

### 2026-06-22 · claude-opus-4-8 · branch `fix/bug-0023-props-panel-empty-after-hidden-init`

Fixed in `src/differ/bpmn/bpmn-differ.js`. The culprit was
`#setPropertiesPanelContainerMaxHeight()` doing
`panelContainer.style.maxHeight = panelContainer.offsetHeight` on
`.bio-properties-panel-scroll-container`:

- When the panel loads hidden ([BUG-0018]), the scroll container's `offsetHeight`
  is 0 (an ancestor is `display:none`), so it set the valid CSS `max-height: 0`,
  which collapsed the panel; **Show properties** restored `display` but the stale
  inline `max-height: 0` stayed → empty panel.
- When the panel loads visible, the assignment was `style.maxHeight = "600"`
  (no unit) — invalid CSS, silently ignored — so the line only ever "worked" by
  being a no-op. (Same unitless-`maxHeight` class of bug [BUG-0021] fixed on the
  changes table.)

The method also served a second, *depended-upon* purpose: its
`await doWithAttempts(...)` waits for the panel to mount before the FEAT-0023
dive-out initial selection runs. So I kept the wait and dropped only the
`max-height` assignment, renaming the method to `#awaitPropertiesPanelMounted()`.
Scrolling is owned by the panel cell's inner `overflow-y:auto` div ([BUG-0021]),
so the max-height was redundant when visible and harmful when hidden.

`npm test` green (997 passed). View-only invariant unaffected (no change to the
`beforeinput` veto or panel DOM). [BUG-0021] scroll behaviour unaffected
(`max-height` removal does not touch the cell's inner-div scrolling).
