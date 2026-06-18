---
id: BUG-0011
title: Fully disable BPMN diagram editing while keeping view mode
priority: medium
status: done
---

## Statement

In the BPMN differ the diagram can still be edited, even though editing should
be disabled: elements are draggable, arrow points/bends (waypoints) move,
double-clicking an element opens name/description editing on the canvas, and the properties-panel
fields are real editable inputs. These side edits are not saved anywhere
(the differ commits nothing), but they create a false impression of an editor and hinder viewing.

We need to **fully** disable editing **while keeping a full-fledged view mode**:
- selecting an element by click → the properties panel shows its parameters;
- diff highlighting (green/red/blue), the change table, search, navigation badges
  (Call Activity "⤵", handlers "‹/›") work as they do now;
- the groundwork for future element comment badges ([IDEA-0002]) is not broken —
  overlays and selection must remain working.

The DMN side is already read-only (`dmn-viewer` is loaded, no modeler is created) — we **don't touch** it.

## Context

### Root cause

The differ renders BPMN via a **full-fledged editor** `BpmnJS` Modeler
(`libs/bpmn-js/bpmn-modeler.production.min.js`, bpmn-js 18.18), not via a viewer
(`bpmn-differ.js:166` `#createModeler()` → `new BpmnJS({...})`). Editing was attempted to be
disabled **cosmetically**, hiding the visible controls via `display:none`:
- `#hideModelerPalleteAndPoweredByLabel()` (`bpmn-differ.js:471`) — hides `.djs-palette`;
- `#hideSchemaEditorControls()` (`bpmn-differ.js:463`) — hides `.djs-context-pad`,
  called on **every** `selection.changed` (`#onSelectedElementChanged`, `bpmn-differ.js:365`),
  twice, with `delay(100)`.

Hiding the buttons does not disable the modeler's interactive modules. The following stay
active (events confirmed in the dist `bpmn-modeler.production.min.js`):
`shape.move.start` (dragging shapes), `bendpoint.move.start`,
`connectionSegment.move.start` (move arrows/waypoints),
`element.dblclick` → `directEditing.activate` (text editing on the canvas),
`resize.start`, `connect.start`. Plus the editable properties-panel fields.

### Why we can't just replace the Modeler with a Viewer

Two consumers depend on the modeler's editing infrastructure, and on a switch to
`NavigatedViewer` they would break:
1. **Diff highlighting** — `DiffHighlighter.paint()` (`diff-highlighter.js:40,63`) colors
   via `modeling.setColor(...)`. The `modeling` service exists only in the Modeler. (Markers
   `canvas.addMarker` — `diff-highlighter.js:105` — work in a viewer too; the problem is precisely
   in `setColor`.)
2. The **properties panel** `bpmn-js-properties-panel` (5.58) is built on top of the Modeler
   (commandStack/modeling); it does not initialize in a viewer.

Therefore the correct path is to **keep the Modeler but mute the editing interactions**,
rather than swap the engine.

### Verified

- `bpmn-js-properties-panel` 5.58 has no global `readOnly` flag: in the dist, `config.readOnly`
  applies only to the nested FEEL/CodeMirror editor, not to the whole panel. So we mute the panel
  separately (see step 2).
- Properties panel container: `BpmnDifferView.PROPS_ID` (`bpmn-differ-view.js:6`,
  `bpmnProps_<suffix>`); the root class of the panel content is `.bio-properties-panel`.
- Relation: [IDEA-0002] (element comments) — opt-in overlays over the schema; this fix
  must leave overlays/selection working so as not to block IDEA-0002.

## What and how to fix

All edits are on the BPMN side only: `bpmn-differ.js` + `styles.css`. We don't touch DMN.

### Step 1. Veto edit interactions on the canvas (EventBus)

bpmn-js sends cancelable `*.start`/`activate` events; a high-priority listener
that returns `false` cancels the action — the command isn't even created. The approach is additive,
doesn't dig into DI internals, and is resilient to library versions.

In `show()`, next to obtaining `bpmnJSEventBus` (`bpmn-differ.js:51`), add:

```js
const EDIT_EVENTS = [
    'shape.move.start', 'bendpoint.move.start', 'connectionSegment.move.start',
    'resize.start', 'connect.start', 'global-connect.start',
    'element.dblclick', 'directEditing.activate'
];
// High priority so the veto fires before the default editing handlers.
bpmnJSEventBus.on(EDIT_EVENTS, 2000, () => false);
```

- Preserved: `element.click` (selection → `selection.changed` → properties panel and badges),
  hover, overlays, zoom/pan.
- After this, `#hideSchemaEditorControls()` on every selection is not needed (the context-pad
  contains only edit actions): its call can be removed from `#onSelectedElementChanged`
  (`bpmn-differ.js:365`) and the method itself (`bpmn-differ.js:463`) together with the `delay(100)` hack.
  The cosmetic one-time hiding of the palette/`.bjs-powered-by`
  (`#hideModelerPalleteAndPoweredByLabel`, `bpmn-differ.js:471`) — keep it.
  If desired, add one-time hiding of `.djs-context-pad` to the same method.

The `EDIT_EVENTS` list should be moved to a `static` class field (or a module constant) — this gives
a point for the unit test (see below) and a single source of truth.

### Step 2. Properties panel — read-only

There is no global flag, the panel re-renders (preact), so CSS is more reliable than
DOM attributes. We block input fields while keeping group collapse/expand and scrolling.
In `styles.css` (the differ-page section):

```css
/* BUG-0011: properties panel is view-only — block field input, keep group
   headers (collapse/expand) and scrolling working. */
.bio-properties-panel input,
.bio-properties-panel textarea,
.bio-properties-panel select,
.bio-properties-panel [contenteditable],
.bio-properties-panel .bio-properties-panel-feel-editor {
    pointer-events: none;
}
```

- Group headers are separate buttons (`.bio-properties-panel-group-header`); we don't touch their
  `pointer-events` → group expansion and viewing properties are preserved.
- Verify the classes against the actual DOM of the running differ (the names `.bio-properties-panel*`
  belong to `@bpmn-io/properties-panel`); on a mismatch — adjust the selectors.
  If the scope needs narrowing: put a marker class on the container `#${BpmnDifferView.PROPS_ID}`
  and prefix the selectors with it.

### What NOT to do (out-of-scope risks)

- Don't replace `bpmn-modeler.production.min.js` with a viewer build (it would break `setColor` and the panel).
- Don't override the modeler's modules (`contextPadProvider`/`paletteProvider`/`labelEditingProvider`)
  via `additionalModules` — this is a working but more version-fragile alternative; for
  this task the EventBus veto achieves the same more simply. If step 1 turns out to be insufficient,
  consider it as a fallback and describe it in the log.
- Don't touch the DMN differ and shared classes in a way that changes their behavior for DMN.

## Preserving current functionality (regression checklist)

After the edits, verify (manual check in the real differ + a test run):

1. **Selection**: click on an element → the properties panel shows its parameters; repeated
   clicks update the panel. `selection.changed` → `#onSelectedElementChanged` fires.
2. **Diff highlighting**: green/red/blue on shapes and rows, TextAnnotation,
   the change table in the footer, the Highlight button (toggle + pulse animation) — unchanged.
3. **Search** (Ctrl/Cmd+F, including a non-Latin layout): finds, centers, selects the element,
   the properties panel shows its parameters (search uses `selection.select`).
4. **Navigation badges**: Call Activity "⤵" and handlers "‹/›" appear on the selected
   element, are clickable, dive-in/opening the code works (overlays + clicks alive).
5. **Switch branch / download / zoom / fit / close** — unchanged.
6. **Editing is forbidden**: dragging an element — no; pulling an arrow/waypoint —
   no; double-clicking an element does not open text editing; the properties-panel fields are not
   editable; the palette/context-pad are not visible.
7. **Nested Call Activity differ** (new tab) — the same behavior (the same `BpmnDiffer`).
8. **DMN differ** — behavior unchanged.

## Tests

- Unit tests against a live bpmn-js modeler are heavy and fragile — the main check of disabling
  editing is done **manually** (the checklist above, items 1–6).
- What to cover with a unit (in the project's spirit: small tests on pure functions/public data —
  `test/bpmn/bpmn-differ.test.js` mirrors `src/differ/bpmn/bpmn-differ.js`):
  - `EDIT_EVENTS` as a `static` field contains the expected set of event names (a guard against
    accidentally removing a line from the list) — without instantiating the modeler.
  - If the panel scope is narrowed by a marker class — a trivial test that the class is set
    (by analogy with `BpmnDifferView.clampPanelWidth`).
- Before push — `npm test` (the registry structural tests are not affected: there are no new files).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (freshest first). -->

### 2026-06-17 · claude-opus-4-8 · branch `fix/bug-0011-disable-bpmn-editing` (condition re-inject)

The remainder of the same timing regression in the condition: expand the Condition group, then
select another sequence flow with a changed condition → the formatting/highlighting did not
appear. The difference from other highlights: the condition does not recolor an existing panel
node (such colors survive a re-render), it **injects its own `div`** next to the native
input. The panel re-renders on selection change (preact) and purges the foreign node during
reconciliation; my polling found the **old** input instantly and injected the block before
the re-render → preact cut it off. Previously `delay(100)` masked this.

Solution: in `showConditionExpression`, inject + confirm that the block survived the polling
interval, with a re-inject until the panel stabilizes (`doWithAttempts(…, 30, 50)`); the input
is re-read each attempt (preact may replace the node), the block is marked
`data-condition-for=<id>`. A regression test was added (the panel cuts the block once →
the method re-injects). 708 tests passed.

### 2026-06-17 · claude-opus-4-8 · branch `fix/bug-0011-disable-bpmn-editing` (audit + doWithAttempts)

Audit "are there other places that depended on the removed `delay(100)`". All
DOM accesses in `src/differ` were checked. All consumers of the **preact-rendered** properties
panel now poll: `#findGroupHeader`, `#highlightListItems`, `showConditionExpression`,
`#setPropertiesPanelContainerMaxHeight`. The overlay navigators (`showDiveInOverlay`,
`showOverlayForSelectedElement`) were also behind the same `delay(100)`, but they read DOM
that diagram-js `overlays.add()` creates **synchronously** (not preact) — they don't need
polling, no regression. The DMN side (`dmn-differ`, `dmn-diff-painter`) is a separate flow,
not affected by my change, and where needed it already polls (`.view-drd`). The cosmetic
one-time hiding of the palette/`.bjs-powered-by` is init-time, outside the selection flow.

At the same time, `doWithAttempts` (`utils.js`) was improved: a superfluous `await delay` after
the last check was removed (a dead wait before `return null`), `var`→`const`,
a doc comment about the contract was added (synchronous `action`, falsy = retry). The
`attempts × delayMs` budget contract is preserved — consumers (`gitlab-dom-scraper`, `dmn-differ`)
are unaffected. The test was strengthened: a check for exactly `attempts` calls on failure. 707 tests passed.

### 2026-06-17 · claude-opus-4-8 · branch `fix/bug-0011-disable-bpmn-editing` (regression 3)

The third facet of the same timing regression: Condition Expression formatting/highlighting
stopped working (the Condition group was colored, but the condition text was not formatted).
The cause — `PropertiesPanelHighlighter.showConditionExpression` synchronously looked for
`#bio-properties-panel-conditionExpression` immediately on selection, before preact rendered the
panel; previously the removed `await delay(100)` covered this. Solution: the method became
`async` and polls for the element's appearance via `doWithAttempts` (like `#findGroupHeader`
and `#highlightListItems`). The `showConditionExpression` tests were switched to `await`,
a regression test was added (the input appears after 60ms — formatting waits for it).
707 tests passed.

### 2026-06-17 · claude-opus-4-8 · branch `fix/bug-0011-disable-bpmn-editing` (regression 2)

Fix of the second facet of the same regression: after Switch branch (especially if a list
item is expanded) the list elements stopped being colored. The root — the call order:
`#showXml` on import re-selects the element → synchronous `selection.changed` →
`highlightDiffPropGroups`, which **synchronously captures the current diff data**.
But `setDiffData` of the new direction was called only in `#highlightDiffs`, already **after**
`#showXml`. That is, panel highlighting on the switch read the previous direction's data;
for added/removed elements (the label exists in only one version) `#findListItemHeaders`
didn't find them. Previously this was masked by the removed `await delay(100)`, which
deferred highlighting to a macrotask — already after `setDiffData`.

Solution: `#highlightDiffs` is split into `#prepareDiffData` (compute + `setDiffData`,
called **before** `#showXml`) and `#paintDiffs` (painting the canvas/table, **after**
import). Now highlighting on `selection.changed` immediately sees the correct direction —
without double calls and races. At the same time the condition-expression highlighting on the switch is fixed
(it also depends on `setDiffData`). Verification — manual (orchestration of `bpmn-differ.js`,
UNTESTED_BY_DESIGN). 706 tests passed.

### 2026-06-17 · claude-opus-4-8 · branch `fix/bug-0011-disable-bpmn-editing` (regression)

Fix of a regression per feedback: highlighting of list-property elements in the panel broke
(errors `list item "…" not found in group "…"`). The cause — removing the method
`#hideSchemaEditorControls()` also removed `await delay(100)`, which implicitly gave the
preact panel time to render the DOM before highlighting. `PropertiesPanelHighlighter.#highlightListItems`
searched for the list elements once (unlike `#findGroupHeader`, which polls via
`doWithAttempts`) and hit a list that wasn't rendered yet. Solution:
`#highlightListItems` now waits for the list to appear (`doWithAttempts` on
`.bio-properties-panel-collapsible-entry-header-title`) and only then matches the descriptors —
resilient to timing, without bringing back the fixed-delay hack. The method became `async`, the
call in `highlightDiffPropGroups` wrapped in `await`. A regression test was added
(`properties-panel-highlighter.test.js`: the list renders after 60ms — highlighting waits for it).
706 tests passed.

### 2026-06-17 · claude-opus-4-8 · branch `fix/bug-0011-disable-bpmn-editing` (extra)

Follow-up per feedback: the initial CSS blocked only text fields, but the
properties panel still had working toggles (on/off) and add/remove buttons for
list elements. The cause: a toggle is rendered as a hidden `<input>` under a clickable
slider (`.bio-properties-panel-toggle-switch__switcher`), and add/remove are separate
`<button>`s (`add-entry`/`remove-entry`/`remove-list-entry`/`dropdown-button`/
`group-header-button`); the checkbox is also toggled by clicking the label. The classes were verified against
`libs/bpmn-js-properties-panel/assets/properties-panel.css`. In `styles.css` I extended the
`pointer-events: none` rule to these clickable wrappers. Group/list collapse
and expanding collapsible entries were left working (they are triggered by `onClick: toggleOpen`
on the header, not on the buttons). Tests: 705 passed.

### 2026-06-17 · claude-opus-4-8 · branch `fix/bug-0011-disable-bpmn-editing`

The plan from "What and how to fix" was implemented in full.

- **Step 1 (EventBus veto).** `bpmn-differ.js`: the list of edit events was moved to
  `static BpmnDiffer.EDIT_EVENTS`; in `show()`, next to obtaining `bpmnJSEventBus`,
  a high-priority (2000) listener `() => false` was attached. The method
  `#hideSchemaEditorControls()` and its call from `#onSelectedElementChanged` were removed
  (together with the `delay(100)` hack — `delay` stays in utils.js, used elsewhere).
  The cosmetic hiding of the palette/`.bjs-powered-by` was kept.
- **Step 2 (properties panel read-only).** `styles.css`: `pointer-events: none` on
  `input/textarea/select/[contenteditable]/.bio-properties-panel-feel-editor`
  inside `.bio-properties-panel`; group headers untouched (collapse/scroll alive).
- **Context-pad.** Hidden via CSS `.djs-context-pad { display:none !important }`,
  not a one-time JS hack (the context-pad is created lazily on the first selection —
  one-time hiding at init is unreliable).
- **Test.** Added `test/differ/bpmn/bpmn-differ.test.js` — it checks the composition of
  `EDIT_EVENTS` (a guard against accidentally removing an event from the list). `bpmn-differ.js`
  was removed from `UNTESTED_BY_DESIGN` in `test/structure/source-layout.test.js`.
- `npm test` — 705 passed. DMN unaffected (on the DMN side there is no `.djs-context-pad`
  and no `.bio-properties-panel`, dmn-viewer is already read-only).

The regression checklist (items 1–6) — manual check in the real differ on the
reviewer's side before the merge; only the composition of `EDIT_EVENTS` is covered automatically.
