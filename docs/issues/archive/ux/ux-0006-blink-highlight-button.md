---
id: UX-0006
title: Highlight button — blinking instead of a static bold highlight
priority: medium
status: done
---

## Statement

Currently, on the **Highlight On** button, all diff elements on the schema first get
a bold static outline (`highlight-diff-big`, 15px) for 2 seconds, then the outline
becomes a thin permanent one (`highlight-diff`, 3px). The attention-grabbing phase is
a static "bold flash".

We want the elements to **blink** instead of the static bold phase, the same way the
current matched element blinks in search (FEAT-0006, `search-match-current` —
a pulsing animation of the outline width + a light glow). After the
blinking finishes, the highlight stays as the previous thin permanent outline.

**Do not change the highlight color** — it stays the current turquoise (`hsl(180, 100%, 70%)`),
only the character of the attention-grabbing phase changes: static thickness → pulse.

## Context

- The blinking reference: `.search-match-current` + `@keyframes search-match-pulse`
  in `src/differ/styles.css` (FEAT-0006). The animation `0.45s ease-in-out 2` +
  `drop-shadow`.
- The Highlight button: `DiffHighlighter.setEnabled()`
  (`src/differ/bpmn/diff-highlighter.js`), two-phase logic with `setTimeout(2000)`.
- ⚠️ `BIG_HIGHLIGHTING_MARKER` (`highlight-diff-big`) is **also** used in
  `changes-table-view.js` — to highlight a single element selected in the table
  (held until the selection is reset). This is a **different** scenario, no need to touch it:
  the pulse is introduced only for the attention-grabbing phase of the Highlight button.

## Work plan

1. **CSS** (`src/differ/styles.css`): add a `.highlight-diff-pulse
   .djs-outline` class with the same turquoise color as `highlight-diff`, a light
   glow (`drop-shadow`) and a pulsing animation of the outline width by analogy
   with `search-match-pulse` (a separate `@keyframes highlight-diff-pulse`, so as not to
   conflict with search). Pick the number of iterations so that the blinking window
   matches the timeout of the transition to the thin highlight.
2. **diff-highlighter.js**: introduce `PULSE_HIGHLIGHTING_MARKER = 'highlight-diff-pulse'`.
   In `setEnabled(true)`, instead of `BIG_HIGHLIGHTING_MARKER` apply the pulse marker,
   and on timeout remove it and apply the thin `HIGHLIGHTING_MARKER`. In the
   disable branch, remove the pulse marker. Keep `BIG_HIGHLIGHTING_MARKER` for
   `changes-table-view.js`.
3. **Align the timeout** of the transition to the permanent highlight with the animation
   duration, so there is no static "freeze" of the bold outline between the end
   of the pulse and the removal of the marker.
4. **Tests/check**: run `npm test`; update the structural tests if any. A manual
   check on a real schema (blinking → thin permanent).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (freshest first). -->

### 2026-06-15 · claude-opus-4-8 · branch `feature/ux-0006-blink-highlight`

The attention-grabbing phase of the Highlight button now blinks instead of a static bold
outline. In `diff-highlighter.js`, `PULSE_HIGHLIGHTING_MARKER`
(`highlight-diff-pulse`) and `PULSE_DURATION_MS = 2000` were introduced; `setEnabled(true)` applies
the pulse marker instead of `BIG_HIGHLIGHTING_MARKER`, and on timeout switches to the thin
permanent `HIGHLIGHTING_MARKER`. In `styles.css`, the class
`.highlight-diff-pulse` (the same turquoise `hsl(180,100%,70%)` + `drop-shadow`) and
`@keyframes highlight-diff-pulse` (an outline-width pulse 3↔12px, `0.5s × 4 = 2s`,
in sync with the timeout) were added. `BIG_HIGHLIGHTING_MARKER` was not touched — it stays for
highlighting the selected row in `changes-table-view.js`. All tests green (619).
It makes sense to check the animation manually in the browser on a real schema.
