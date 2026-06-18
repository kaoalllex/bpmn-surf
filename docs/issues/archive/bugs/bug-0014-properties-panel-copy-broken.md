---
id: BUG-0014
title: Copying text from the properties-panel fields doesn't work (BUG-0011 regression)
priority: medium
status: done
---

## Statement

In the BPMN differ you open the properties panel of the selected element and want to copy
text from a field (ID, name, documentation, etc.) — you can't select with the mouse and `Ctrl/Cmd+C`.
The fields are "dead": clicking them doesn't place the cursor, the text isn't selected.

We need to restore the ability to **select and copy** text from the ordinary text fields
of the properties panel, **while keeping the editing ban** (without bringing back [BUG-0011]).

## Context

### Root cause

A regression of the [BUG-0011] fix (step 2 "properties panel read-only"). Field editing
was disabled purely via CSS in `src/differ/styles.css`:

```css
.bio-properties-panel input,
.bio-properties-panel textarea,
.bio-properties-panel select,
.bio-properties-panel [contenteditable],
.bio-properties-panel .bio-properties-panel-feel-editor,
/* + toggles, checkboxes, add/remove buttons, dropdown, feel-popup */ {
    pointer-events: none;
}
```

`pointer-events: none` on `input`/`textarea` blocks **any** mouse interaction:
no click → no focus → no mouse selection → no copy. These are exactly the text
fields the user copies from.

There's no pure-CSS way to "can't edit but can select/copy":
`pointer-events:none` is incompatible with copying, and `user-select` doesn't help (you can't start
a selection without a click). So edits to text fields must be blocked by a non-CSS mechanism.

### Solution (agreed with the user) — `beforeinput` veto

- Remove `input` and `textarea` from the `pointer-events: none` rule in `styles.css` — they become
  clickable, selectable and copyable again.
- Block edits to these fields with **a single delegated `beforeinput` listener** in
  the capture phase on the properties-panel container (`#${BpmnDifferView.PROPS_ID}` /
  `.bio-properties-panel`), calling `preventDefault()`. `beforeinput` covers typing
  text, backspace/delete, paste (`insertFromPaste`) and drop (`insertFromDrop`); meanwhile
  `Ctrl/Cmd+C` and selection don't produce `beforeinput` → copying is preserved.
  Delegation on the container survives the panel's preact re-renders without a poll/MutationObserver.
- Conceptually this is the same "additive veto" as the EventBus veto on the canvas from [BUG-0011]
  (`BpmnDiffer.EDIT_EVENTS`, `() => false`).

What **remains** under `pointer-events: none` (not text input — copy is irrelevant, and
reliably muting them with a `beforeinput` veto is harder): `select`, `[contenteditable]`,
`.bio-properties-panel-feel-editor`, toggles (`...toggle-switch__switcher`,
`...feel-toggle-switch`), checkboxes (`...checkbox`, `...feel-checkbox`), the
add/remove buttons (`...add-entry`, `...remove-entry`, `...remove-list-entry`),
`...group-header-button`, `...dropdown-button`, `...open-feel-popup`.

### Out of scope

- **Copying FEEL expressions** (CodeMirror / `contenteditable` /
  `.bio-properties-panel-feel-editor`) — a separate task. CodeMirror has its own
  input/clipboard handling, a simple `beforeinput` veto is unreliable there; to avoid
  risking bringing back [BUG-0011] on the FEEL fields, in this bug we don't touch them (they remain
  non-copyable, as now — no regression relative to the current state).
- The DMN side is unaffected (there is no `.bio-properties-panel` there, dmn-viewer is already read-only).

### Regression checklist (after the fix)

1. From the ordinary panel fields (ID, name, documentation) text **is selected and copied**
   (`Ctrl/Cmd+C`).
2. Editing is forbidden: typing characters, backspace/delete, paste, drop into these fields
   **don't change the value**.
3. Toggles/checkboxes/add-remove buttons/dropdown/FEEL-popup still don't fire.
4. Collapsing/expanding groups and lists, scrolling the panel — work.
5. Diff highlighting in the panel (groups, list-items, condition expression) — unchanged.

### Affected files

- `src/differ/styles.css` — remove `input`/`textarea` from `pointer-events: none`.
- `src/differ/bpmn/bpmn-differ.js` — attach a delegated `beforeinput` veto on the
  panel container (next to the rest of the panel initialization/`show()`).

### Relations

- A regression of [BUG-0011] (disabling BPMN editing while keeping viewing).
- Close in topic: [BUG-0009] (Ctrl+C blocked by a handler) — a different source, don't confuse them.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (freshest first). -->

### 2026-06-17 · claude-opus-4-8 · branch `fix/bug-0014-properties-panel-copy`

Variant A implemented. `styles.css`: removed `input`/`textarea` from the
`pointer-events: none` rule (the other controls — `select`, `contenteditable`,
the FEEL editor, toggles, checkboxes, add/remove buttons, dropdown, feel-popup — kept).
`bpmn-differ.js`: in `show()`, next to the canvas veto ([BUG-0011]), a delegated
capture-listener `beforeinput` was attached on the stable panel container
(`#${BpmnDifferView.PROPS_ID}`), calling `preventDefault()` — it mutes typing/deletion/
paste/drop, but not `Ctrl/Cmd+C` and selection, so copying works; delegation
survives preact re-renders without a re-bind. FEEL expressions remain out of scope (a separate
task). A unit check for the DOM-bound orchestration in `show()` is not applicable (no pure
function) — the check is manual against the checklist. `npm test` — 765 passed.
