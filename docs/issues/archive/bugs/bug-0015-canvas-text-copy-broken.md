---
id: BUG-0015
title: Label text on the canvas and comment text can't be selected or copied (BUG-0011 regression)
priority: medium
status: done
---

## Statement

In the BPMN differ, on the canvas, you can't select with the mouse and copy (`Ctrl/Cmd+C`) the
text of element labels — task/step names, gateways, events — nor the text
of comments (`bpmn:TextAnnotation`). Double-clicking an element no longer opens
anything, and selecting the SVG text directly doesn't work either.

We need to restore the ability to **select and copy** label and comment text
right on the schema, **while keeping the editing ban** (without bringing back [BUG-0011]).

## Context

### Root cause

A regression of the [BUG-0011] fix. Before it, the only way to get the label text in a
selectable/copyable form was a **double-click → direct editing**: bpmn-js opened a
contenteditable overlay `.djs-direct-editing-content` over the element with the label
text, from which the text could be selected and copied.

[BUG-0011] muted exactly this path. In `BpmnDiffer.EDIT_EVENTS`
(`src/differ/bpmn/bpmn-differ.js:12`) among the veto events are `element.dblclick` and
`directEditing.activate`, and the high-priority listener `() => false`
(`bpmn-differ.js:104`) cancels editing activation before the text
overlay opens. The double-click stopped opening the field → nowhere to copy from.

The SVG labels themselves (`<text class="djs-label">`) are not natively selectable: over the element
lies a transparent hit layer (`.djs-hit-all`), intercepting the pointer for the sake of
`element.click` (selection). bpmn-js is not designed for selecting text on the canvas.

This is essentially the same "can't edit but need to copy" problem as
[BUG-0014] (properties-panel fields) — only on the canvas, not in the panel.

### Solution (agreed with the user) — restore direct editing + `beforeinput` veto

The same "additive veto" as in [BUG-0014] (panel fields) and [BUG-0011] (EventBus on the
canvas), applied to direct editing:

- Remove `element.dblclick` and `directEditing.activate` from `BpmnDiffer.EDIT_EVENTS`
  (`bpmn-differ.js:12`) — the double-click again opens the contenteditable overlay with the
  label text, the text is selected and copied. The other edit events
  (`shape.move.start`, `bendpoint.move.start`, `connectionSegment.move.start`,
  `resize.start`, `connect.start`, `global-connect.start`) stay vetoed.
- Block edits to this overlay with **a delegated capture-phase `beforeinput` listener**
  on the stable canvas container
  (`#${BpmnDifferView.CANVAS_ID}` — `bpmn-differ-view.js:5`), inside which bpmn-js
  lazily creates `.djs-direct-editing-content`. The listener calls `preventDefault()`:
  it mutes typing, backspace/delete, paste (`insertFromPaste`) and drop
  (`insertFromDrop`); meanwhile `Ctrl/Cmd+C` and selection don't produce `beforeinput` →
  copying is preserved. Delegation on the container survives the overlay's
  recreation without a poll/MutationObserver. Do it next to the properties-panel
  `beforeinput` veto in `show()` (`bpmn-differ.js:115-118`).

Completing editing (`directEditing.complete` on blur/Enter/Escape) with
unchanged text is effectively a no-op: `labelEditingProvider` would call
`modeling.updateLabel` with the same value, but the text wasn't changed (`beforeinput`
is blocked), and the differ commits nothing. If verification reveals that an empty
command is a problem (e.g., it litters the undo stack or flickers highlighting) — additionally
mute it via a veto on `commandStack.element.updateLabel.canExecute` or
`directEditing.complete`; in the basic variant this is not required.

### What NOT to do (out of scope)

- **Variant B — native selection of the SVG text via CSS `user-select`** was rejected:
  the hit layer intercepts the pointer, it's cross-browser fragile, selection
  between elements is awkward, and it poorly covers comments.
- Don't return the other edit events to `EDIT_EVENTS` — moving/resizing/connecting
  is still impossible.
- The DMN side is unaffected (dmn-viewer is already read-only, has no direct editing of its own).

### Regression checklist (after the fix)

1. Double-clicking a task/gateway/event opens the label text; it can be
   **selected and copied** (`Ctrl/Cmd+C`).
2. The same for comment text (`bpmn:TextAnnotation`).
3. Editing is forbidden: typing characters, backspace/delete, paste, drop into
   the open overlay **don't change the label/text** (the value on the schema doesn't change).
4. Dragging elements, moving waypoints/bends, resizing, connecting —
   still forbidden ([BUG-0011] is not broken).
5. Selection by click, the properties panel, diff highlighting, search, navigation badges —
   unchanged.
6. Copying from the properties-panel fields ([BUG-0014]) — unchanged.

### Affected files

- `src/differ/bpmn/bpmn-differ.js` — remove `element.dblclick`/`directEditing.activate`
  from `EDIT_EVENTS`; attach a delegated `beforeinput` veto on the canvas container
  (`BpmnDifferView.CANVAS_ID`) next to the properties-panel veto in `show()`. Fix the test
  of the `EDIT_EVENTS` composition (`test/differ/bpmn/bpmn-differ.test.js`).

### Relations

- A regression of [BUG-0011] (disabling BPMN editing while keeping viewing).
- A direct analog of [BUG-0014] (the same copy-without-editing, but in the properties panel) —
  reuses the `beforeinput` veto technique.
- Close in topic: [BUG-0009] (Ctrl+C blocked by a handler) — a different source, don't confuse them.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (freshest first). -->

### 2026-06-18 · claude-opus-4-8 · branch `fix/bug-0015-canvas-text-copy`

The agreed variant was implemented. Removed `element.dblclick` and
`directEditing.activate` from `BpmnDiffer.EDIT_EVENTS` (`bpmn-differ.js`) — the double-
click again opens the contenteditable label overlay, the text is selected and
copied. Edits to the overlay are blocked by a delegated capture-phase
`beforeinput` veto on the canvas container (`BpmnDifferView.CANVAS_ID`) next to the
analogous properties-panel veto in `show()`: it mutes typing/delete/paste/drop, while
`Ctrl/Cmd+C` and selection don't produce `beforeinput` → copying is preserved.
An empty `updateLabel` command on blur/Enter was not needed (the text wasn't changed).
The `EDIT_EVENTS` composition test was updated. 765 tests passed.
