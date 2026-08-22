---
id: FEAT-0031
title: BPMN edit mode — edit the shown diagram in a separate tab and download the result
priority: medium
status: in-progress
---

## Statement

Open the BPMN diagram the extension is currently showing in an **edit mode** and
download the edited file. Nothing is ever written back to the repository — the
whole session lives in the browser tab.

**Entry point:** an `✎` button in the BPMN differ toolbar. One button covers both
scenarios from the original request — plain schema viewing and BPMN diff review
in an MR — because both are the same differ page in different modes. The click
opens a **new differ tab** whose params carry `mode: 'edit'`; the **baseline** is
the version that was on screen at that moment. A second click focuses the already
open edit tab instead of starting a second session.

`mode` is **not a URL query parameter** — a differ tab has no URL of its own. It
is `window.open('about:blank')` plus injected scripts plus a `postMessage` of the
params (`utils.js#openDiffer`, reached through `DifferTabNavigator`, which also
supplies the resource-href lookup that `chrome.runtime.getURL` cannot provide in
an opened tab). So `mode`/`editSide` are two more fields of `DifferParams`.

While editing, the changes relative to the baseline are highlighted on the
canvas, so the page effectively shows a live diff `baseline → edited`. The result
is downloaded as a single `.bpmn` file named
`<original-name>-edited-<yyyyMMdd-HHmmss>.bpmn`.

### v1 scope

- BPMN only; the source is always a file already opened through the extension
  (repo file view, or one of the two versions in an MR diff)
- canvas editing: palette, context pad, undo/redo, `Delete`
- **editable properties panel** — names, `camunda:class`/`delegateExpression`,
  topics, conditions, In/Out mappings, Inputs/Outputs
- **automatic diff colouring of the edits**: added = green, changed = blue (the
  existing `DiffType` palette), drawn as a display-only marker layer
- **a manual colour control** — a few swatches plus "Default", applied to the
  selection; a user colour wins over the diff colour, and resetting an element to
  the default colour brings the diff colour back
- a **toggle "colour the edits"** (on by default) governing both the screen and
  the exported file
- download of exactly one `.bpmn` file — no other artifacts, through the toolbar's
  existing `↓` button (retitled in edit mode), so the bar never carries two `↓`
- an unsaved-changes warning when the tab is closed

### Deliberately not in v1

Everything below is out of scope. Some of it came up while designing v1 and is
worth remembering — recorded as **ideas for possible future development**, not as
a planned next phase: whether any of them is built, and in what shape, is an open
question.

- **ghosts of deleted elements** — a red dashed overlay at the original bounds of
  a deleted element (outside the model, never exported); today the only idea we
  have for showing deletions on the canvas at all
- SVG/PNG export and "copy XML to clipboard" — sharing an edit inside an MR
  discussion rather than as a file
- opening an arbitrary local `.bpmn` — a sandbox mode; the same wish appears in
  [FEAT-0030]
- DMN editing — the DMN differ loads `dmn-viewer`, there is no modeler in `libs/`,
  so this is a large separate piece of work
- treating layout-only changes (moves, waypoints) as diff entries
- a list of the edits (a changes table): dropped on purpose, see below

## Context

### Why this is cheaper than it looks: the modeler is already there

The BPMN differ renders through the full `BpmnJS` **Modeler**
(`libs/bpmn-js/bpmn-modeler.production.min.js`), not a viewer — the properties
panel and `modeling.setColor` both require it ([BUG-0011]). Editing is not
absent, it is **muted**:

- `BpmnDiffer.EDIT_EVENTS` — a high-priority `eventBus` veto on move/resize/
  connect/bendpoint ([BUG-0011])
- a capture-phase `beforeinput` veto on the properties panel ([BUG-0014])
- a capture-phase `beforeinput` veto on the canvas direct-editing overlay ([BUG-0015])
- `.djs-palette` hidden in `#hideModelerPalleteAndPoweredByLabel()`, `.djs-context-pad`
  hidden in `styles.css`

So edit mode is **exactly gating those four mutes behind a mode flag**. No new
library, no new runtime dependency, no build step — and no keyboard wiring either:
`diagram-js` binds its `Keyboard` module implicitly on `canvas.init` (to the canvas
SVG, which it gives `tabindex="0"`), so undo/redo, `Delete` and copy/paste are live
in edit mode the moment the mutes come off. Explicit `keyboard.bind(node)` has been
unsupported since diagram-js 15 and only logs an error. Binding scoped to the canvas
is also the behaviour we want: keystrokes aimed at the properties panel never reach
the canvas bindings, so typing a name cannot delete the selected element.

The diff engine is reusable as-is: `BpmnXmlComparator.compare(myXml, otherXml)`
takes two XML strings, so "baseline → edited" is the same machinery pointed at a
different pair.

### Colour model

Four layers; the topmost one that applies wins.

| Layer | Lives in | Reaches the downloaded file |
|---|---|---|
| 1. Colour set by the user via the colour control | the model (`modeling.setColor`) | always |
| 2. My edits (green = added, blue = changed) | CSS marker layer, model untouched | only when the toggle is on |
| 3. The MR diff (when the editor was opened from diff view) | CSS marker layer, model untouched | only when the toggle is on |
| 4. Colour that came with the file | the model (imported with the XML) | always |

The decisive difference from the viewer: **in edit mode the MR diff is also
painted with markers, not `modeling.setColor`**. That single choice removes three
problems at once:

1. `setColor` goes through the command stack, so auto-recolouring after every
   edit would put a colour command between the user and their own edit — the
   first `Ctrl+Z` would undo a colour instead of the change;
2. "a user colour beats the diff colour" becomes automatic — an element that
   carries an explicit colour in the model simply gets no fill marker;
3. the toggle can honestly govern the screen and the export at once, because
   everything *we* paint is outside the model.

Concretely this means `BpmnDiffer#paintDiffs` is **not called at all** in edit
mode — not merely "painted differently". It is the single entry point for both
`DiffHighlighter.paint` (which is `modeling.setColor`) and `ChangesTableView.fill`
(which is not constructed here), so one guard at its top hands the computed MR
diff to the `EditSession` and returns. Skipping it is what keeps
`commandStack.canUndo()` an honest dirty flag: were the MR diff painted with
`setColor`, the stack would be non-empty before the user touched anything, so the
tab would warn about unsaved changes on close and the first `Ctrl+Z` would undo
the diff colouring.

An element that already has an explicit colour (layer 1 or 4) still gets a
**dashed outline** in the diff colour instead of a fill, so an edit is never
invisible.

The new markers are named `edit-diff-*` — deliberately distinct from the existing
`highlight-diff*` markers, which are a different concept (the `☼` button's cyan
attention outline, `DiffHighlighter.HIGHLIGHTING_MARKER`). The `☼` button is
hidden in edit mode, but the class names must not collide anyway.

A side effect worth having: a CSS fill marker works on `bpmn:TextAnnotation`,
which `modeling.setColor` does not — the viewer patches that case through the DOM
by hand (`DiffHighlighter.paint`). So in edit mode the annotation colours
correctly both on screen (marker) and in the export (the colorizer writes the
`bpmndi:BPMNShape`, which exists for an annotation too). Only the *manual* colour
control, which goes through `setColor`, still cannot colour one.

Deleted elements are not shown on the canvas in v1. Re-inserting a deleted
element in red would put it into the downloaded file and break the process; the
only idea we have for showing them is the ghost overlay listed above.

### Data flow

1. open a tab with `mode: 'edit'` + `editSide` (`'target' | 'source'`, read from
   `BranchIndicator.isTargetBranchShown()` at the moment the `✎` button is clicked);
   `DiagramVersions` loads **both** versions as today — the edit side is the baseline,
   the other side still feeds colour layer 3. The edit tab's params must be built by a
   dedicated `DifferParams#toEditDifferParams(editSide)`, **not** by
   `toNestedDifferParams()`: that one is for a *different* file and silently drops
   `targetFilePath` (the BUG-0002 rename case, where the base side loads from another
   path) and `localFileContent` ("Diff with local")
2. import the chosen side, then take `saveXML()` **immediately after the import** —
   that round-tripped XML is the baseline, otherwise bpmn-js normalisation shows
   up as phantom edits on an untouched diagram
3. `commandStack.changed` → debounce ≈300 ms → `saveXML()` → one comparator run,
   `compare(current, baseline)`, yielding added + changed (deletions are an
   explicit v1 exclusion, see above — there is nothing left on the canvas to paint
   them on)
4. the result drives the marker layer and the properties-panel group highlight
   (`PropertiesPanelHighlighter` is fed *my* diff instead of the MR diff)
5. download: `saveXML({format: true})` → a pure `EditXmlColorizer.apply(xml, colorById)`
   that writes `color:background-color` / `bioc:fill` onto `bpmndi:BPMNShape` and
   `color:border-color` / `bioc:stroke` onto `bpmndi:BPMNEdge` (a connection shows
   its diff in the stroke, matching `DiffType.rowColor`), with `colorById` produced
   by a pure resolver implementing the table above. The colorizer must also **declare
   the two namespaces** on `bpmn:definitions` (`xmlns:color`, `xmlns:bioc`): bpmn-js
   emits those declarations only when the model itself carries such attributes, and
   here it does not — the colours are added after the export, so an undeclared
   prefix would make the file invalid.

`bpmn-js` writes both the OMG non-normative `color:*` attributes and the legacy
`bioc:*` ones (`SetColorHandler#ensureLegacySupport`), which is exactly what
Camunda Modeler and bpmn.io read — an arbitrary hex renders there; only the
*picker* has a fixed palette, not the renderer.

### No changes list, no edit counter

The footer changes table earns its place in MR review, where the changes were
made by somebody else. In an editor the user has just made them and sees them on
the canvas, so v1 renders no table and no counter; `ChangesTableView` is simply
not constructed in edit mode. The unsaved-changes warning takes its dirty state
from `commandStack.canUndo()` — honest only because nothing but the user's own
actions ever reaches the stack here (see the colour model above).

`PropertiesPanelHighlighter` is fed the recomputed diff, but `PropertiesGroupExpander`
is **not**: it auto-opens the groups a diff touches, which in a viewer is helpful and
in an editor would re-open groups under the user's hands after every keystroke. It
keeps whatever data the initial import gave it and is not refreshed.

### Files

New — `src/differ/bpmn/edit/`:

| File | Purpose |
|---|---|
| `edit-session.js` | edit-mode lifecycle: baseline, debounced recompute, wiring, dirty/`beforeunload` |
| `edit-diff-painter.js` | the display-only marker layer (fill markers, dashed outline for explicitly coloured elements) |
| `edit-color-control.js` | the toolbar swatches → `modeling.setColor`; "Default" clears |
| `edit-color-resolver.js` | pure: the layer table → `Map<elementId, {diffType, outlineOnly}>` |
| `edit-xml-colorizer.js` | pure: apply that map onto the exported XML string |

The colour control keeps **no** set of user-coloured ids: layers 1 and 4 both live
in the model, are indistinguishable there, and are meant to behave identically — so
the resolver reads "does this element carry an explicit colour" from the model
(`element.di`) on each recompute instead of tracking it. That is also what makes
"reset to Default brings the diff colour back" work with no extra bookkeeping.

Changed:

- `differ-params.js` — `mode` (`view` \| `edit`), `editSide`, `toEditDifferParams()`;
  `identityKeyFor()` gains the mode so the edit tab is not deduplicated against the
  view tab ([BUG-0017] machinery). It has four call sites and the view-mode key must
  stay byte-identical (a dive-in precomputes the key the *target* tab will publish),
  so the mode is appended as `params.mode || 'view'` on both the producing and the
  consuming side. The `✎` handler asks the registry for the **edit** key — built from
  the edit params, not from this tab's — so a second click focuses the open editor
- `bpmn-differ.js` — the four mutes behind the mode flag, import only the
  `editSide` version, one guard at the top of `#paintDiffs` handing the MR diff to
  the `EditSession`, and the `onOpenEditor` callback
- `bpmn-differ-view.js` — the `✎` button in view mode; in edit mode a toolbar
  group `↶ ↷ · colour swatches · ☑ Colour the edits · ↓ Download .bpmn`, with
  "Switch branch" and the `☼` highlight button hidden (the toggle replaces `☼`).
  Search, the properties panel, dive-in/dive-out and the handler/correlation
  badges stay as they are — they read the model and are harmless while editing
- `styles.css` — the edit marker classes, palette/context-pad visible in edit mode
- `diagram-versions.js` / `utils.js` — the blob+anchor download is extracted to
  `downloadTextFile(content, fileName)` in `utils.js`, because the edit download
  needs a verbatim file name while `DiagramVersions.download()` always prefixes
  `${branchName}-`. Pure extraction; both differs keep calling it as before
- the three registries: `manifest.json#web_accessible_resources`,
  `utils.js#loadScripts`, `test/support/scope.js#SCOPE_FILES`
- `docs/architecture.md` — the new `edit/` level under `src/differ/bpmn/`

### Tests

Unit (`node:test` + jsdom, mirroring the source layout in `test/differ/bpmn/edit/`):
the colour resolver's priority table, the XML colorizer, `identityKey` with the
mode, the toolbar group in jsdom.

E2E (Playwright, on top of `test/e2e/support/boot-differ.js`):

- `differ-edit-boot.spec.js` — the mode boots: palette **and context pad** visible,
  a drag actually changes the model, the properties panel accepts input
- `differ-edit-markers.spec.js` — add/change an element → markers appear; toggle
  off → markers gone
- `differ-edit-download.spec.js` — the downloaded XML carries the edit and the
  colours; with the toggle off it carries no diff colours
- the existing `differ-view-only.spec.js` must stay green — it is the regression
  guard for [BUG-0011] and proves the viewer did not become editable

### Risks and accepted trade-offs

- Un-muting revives exactly what [BUG-0011] / [BUG-0014] / [BUG-0015] fixed. It
  is contained to edit mode, but only if the mode flag is honoured in **all four**
  mute points; `differ-view-only.spec.js` is the guard.
- `saveXML` is a round trip: bpmn-js reformats attribute order and indentation, so
  the git diff of the downloaded file is wider than the semantic edit. Fine for
  handing a file to a person, worth knowing before committing it as-is.
- A file downloaded with the colouring on is a review artifact; if it is committed,
  the colours go into git. Mitigated by the toggle and the `-edited-<timestamp>`
  file name.
- Geometry-only edits (moves, waypoints) never appear in the diff: the comparator
  walks `bpmn:process` descendants and ignores `bpmndi` entirely. Deliberate for
  a semantic diff, surprising in an editor — hence stated here.
- `modeling.setColor` does not work on `bpmn:TextAnnotation` (the viewer already
  patches its fill through the DOM), so the **manual** colour control cannot colour
  one. The automatic diff colour is unaffected — it is a CSS marker on screen and a
  `bpmndi:BPMNShape` attribute in the export, neither of which goes through `setColor`.
- **`compare()` throws on a diagram with no executable process** ([BUG-0029]). It
  picks `bpmn:process[isExecutable="true"]` and immediately dereferences it; only
  `myDoc` is at risk, since `otherDoc` is reached only through `getElementById`. In
  view mode the input is a repository file, so this never fired; in edit mode the
  user can clear "Executable" in the properties panel and the next recompute throws.
  Handled locally: the recompute aborts, warns once per streak, keeps the previous
  colouring (clearing it would flash the canvas on a state the user may undo in a
  second) and marks the toolbar toggle `⚠` — because the state can also be
  permanent, and a frozen-but-silent diff is worse than a stale one. The root fix
  belongs in the comparator, where every caller routes through, and is tracked
  separately as [BUG-0029] — it also affects the view-mode path, which this feature
  does not touch.
- **`saveXML()` is async, `commandStack.changed` is not.** Two recomputes can be in
  flight at once and finish out of order, repainting stale colours. A monotonic token
  compared after the await ("latest wins") is the whole fix; the debounce alone is
  not enough.
- The `keyboard` module binds on the canvas SVG (diagram-js implicit binding, not
  `document`), while the search panel's capture-phase `Ctrl+F` / `Escape` handler
  (`SearchPanel#onGlobalKeyDown`) binds on `document`. The non-collision conclusion
  holds even more strongly than a shared-target analysis would suggest: bpmn-js
  binds neither key for editing, its `Keyboard` ignores events whose target is an
  `input`/`textarea`/`contenteditable` (so typing a name cannot delete an element),
  and the search handler stops `Ctrl+F` in capture before it can reach the canvas.
  Worth re-checking if either binding grows.

### Related

- [BUG-0011], [BUG-0014], [BUG-0015] — the mutes this feature gates by mode
- [FEAT-0030] — token simulation; shares the "open an arbitrary BPMN file" wish
- [FEAT-0022] — schema validator; the natural consumer of an editable model
- [IDEA-0002] — element comments; another overlay-based review layer
- [UX-0007] — the toolbar language the edit group must follow
- [BUG-0029] — the comparator's unguarded executable-process lookup, found while
  designing this feature and worked around locally here

## Work log

<!-- Each AI session on the task — a separate entry by the template below.
     Add new entries on top (freshest first). -->

### 2026-08-22 · claude-opus-5[1m] · branch `feature/feat-0031-bpmn-edit-mode`

Second manual-testing round, two panel-colouring defects fixed.

`PropertiesPanelHighlighter` picked the add/remove colour of a list entry (and of
a condition part) from *which branch is shown* — the right question in view mode,
the wrong one in edit mode, where the shown diagram is always the newer side and
the baseline is the other. Editing the target side therefore painted an entry the
user had just added RED. The predicate is now `isBaseSideShownFunc` and the differ
passes `false` for it in edit mode.

The panel repainted only on `selection.changed`, so a diff recompute could not
reach the currently selected element: undo/redo changed the model and the canvas
while the group headers kept the colour of the previous state until the user
clicked the canvas again. `EditSession` now calls back into the differ after
`setDiffData`, and the differ re-runs `highlightDiffPropGroups` for the current
selection. Both pinned by `differ-edit-prop-group.spec.js`, each case verified to
fail with its own fix removed.

Third defect of the round, pre-existing in view mode too: replacing an element's
type made it blue with nothing saying why — `#compareNodes` stops at the tag
mismatch and names no property, so no group is highlighted. The comparator now
reports `typeChangedIds`, and the panel paints the element type in its own header
(`.bio-properties-panel-header-type`) with the 'changed' colour. Chosen over
injecting an "old → new" line: the header is where the type already lives.

Fourth defect, also pre-existing in view mode: adding an input parameter and then
deleting it leaves `<camunda:inputOutput/>` in the model — the properties panel
creates the container and never removes it — so the element stayed blue with no
group highlighted (`#nodeToDiffs` unwraps the container into its entries, of which
there are none, and logged `not text child not found`). `#significantChildren()`
now drops an attribute-less, childless, textless element of the camunda extension
namespace (plus the `bpmn:extensionElements` wrapper), recursively. The same rule
covers a field whose value was cleared — `<camunda:failedJobRetryTimeCycle/>` kept
the Job execution group blue — which is why it is a namespace rule rather than a
list of container tags. The bpmn namespace is deliberately excluded: there bare
presence IS the value (`bpmn:terminateEventDefinition`). The empty element still
reaches the downloaded file: that is bpmn-js writing what is in the model, not a
colouring bug.

Fifth: the Extension properties list had no `#LIST_GROUP_CONFIG` entry, so its
entries were never coloured individually — only the group header went blue. Added
(`camunda:property` under `camunda:properties`, labelled by `name`, which is what
the panel renders as the entry title), together with the missing
`camunda:property` / `camunda:property/name` / `camunda:property/value` rows in
`#DIFF_TO_PROPERTY_GROUP_MAP` — without them a change *inside* an existing list
was reported as an unmapped diff and highlighted nothing at all. Caveat: a
`camunda:property` under a form field now maps to Extension properties too; the
diff name carries only one level of parent, and before this it mapped to nothing.

Not a defect of ours: the `ContextPad#getPad is deprecated` console line comes from
bpmn-js 18.18.0 itself (`_getMenuPosition` of the align-elements context-pad entry
calls the deprecated diagram-js API); no call of ours is involved.

### 2026-08-22 · claude-opus-5[1m] · branch `feature/feat-0031-bpmn-edit-mode`

Review/manual-testing round. Fixed the phantom colouring found by hand: the
baseline was taken from `saveXML()` (compact) while every recompute exports
`saveXML({ format: true })`, so the comparator read the added indentation inside
`extensionElements` as a change on every element that has such children. The
baseline now goes through `currentXml()`; pinned by a new case in
`differ-edit-markers.spec.js`.

The same round removed the underlying sensitivity in `BpmnXmlComparator`, which
also affected view mode (a file reindented in an MR read as changed everywhere):
`#significantChildren()` drops whitespace-only text nodes from the positional
walk, `#markupOf()` collapses whitespace between tags before matching subtrees,
and the sequence-flow condition texts are located by tag instead of by the child
index `1`. Not addressed there: reflowed text *content*
(`<camunda:inputParameter>\n  1\n</…>` vs `<…>1</…>`) still counts as a change.
Pinned by five unit cases, each verified to fail with the fix removed.
`DmnXmlComparator` had the same exposure (inputs, outputs and rule entries matched
as raw markup) and got the same treatment; the whitespace-collapsing helper lives
in `utils.js#markupOf` and is shared by both comparators.

### 2026-08-21 · claude-sonnet-5 · branch `feature/feat-0031-bpmn-edit-mode`

Implemented edit mode end to end: mode/editSide params and the edit identity key,
the four BUG-0011/0014/0015 mutes gated by mode, the marker-based colour layer
(resolver + painter + styles), the edit session (baseline, debounced recompute,
dirty guard), the colour control and the coloured download. Unit + e2e green.
Status left `open`: the whole-branch review has not run yet.
