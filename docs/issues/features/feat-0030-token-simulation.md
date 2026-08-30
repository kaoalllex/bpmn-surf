---
id: FEAT-0030
title: Add token simulation mode for BPMN diagrams
priority: low
status: open
---

## Statement

Add a lightweight Token Simulation mode to BPMN Surf for interactive execution of BPMN diagrams directly inside the viewer.

A user should be able to open a BPMN diagram, start a simulation from a selected Start Event,
and step through the process while observing token movement.

**What this is for.** Building a mental model of an unfamiliar process — stepping a token
through a large diagram with many gateways is how you come to understand it — and explaining
a process to an analyst. Secondarily, in a diff: the change list says *what* changed, and a
simulation run says what that does to the flow (a gateway whose type changed from XOR to AND
now deadlocks, say).

**What this is NOT for.** It is not a correctness check. Conditions on flows are not
evaluated — at an exclusive gateway the library asks the user which way to go — so this
validates the *shape* of the control flow, not routing logic. It models no variables and
treats a Call Activity as a single opaque node, so it cannot see the most common defect
found in review here: variables passed into a Call Activity incorrectly. That class of error
is [FEAT-0032]; it is why this task is `low` and not `medium`.

The structural defects it does catch are real but, on this project, rare: deadlocks at
mismatched gateway pairs (split XOR, join AND), leaked tokens, unreachable branches,
mis-wired boundary events.

## Context

The idea came from feedback after comparing BPMN Surf with the IntelliJ plugin "BPMN Editor", which includes a Token Simulation mode.

Although BPMN Surf is primarily used for GitLab Merge Request review, token simulation would also be valuable when simply viewing a BPMN diagram. A useful extension of this feature would be allowing BPMN Surf to open arbitrary BPMN files outside of Merge Requests.

Typical use case:

- reviewing a large process with multiple gateways and Call Activities;
- interactively exploring execution paths;
- validating routing logic without deploying the process.

Token simulation should be implemented with https://github.com/bpmn-io/bpmn-js-token-simulation

Out of scope for the initial version:

- process variables;
- expression evaluation;
- JavaDelegate/External Tasks;
- full Camunda-compatible execution semantics.

(The original scope list also excluded timers, messages, signals and sub-process
execution. That turned out to be moot — see "Coverage" below: the library
implements them, and *removing* them would be extra work, not less.)

Future improvements:

- opening arbitrary local BPMN files;
- integration with GitLab diagram view mode.

## Implementation notes

Researched 2026-08-29 (see the work log entry); no code written. Everything below
was verified against `bpmn-js-token-simulation@0.40.0` and the current sources —
recheck against the version actually installed.

### The blocker, and how it is solved

The package publishes **ESM sources only** (`lib/`) — no `dist/`, no UMD, on npm or
any CDN. Every other entry in `libs/` is a ready `.js` that `sync-libs.js` copies;
here there is nothing to copy. It has to be bundled into an IIFE that defines a
global, the same shape as `BpmnJS` / `DmnJS` / `window.BpmnJSPropertiesPanel`.

esbuild is already a devDependency (added for [INFRA-0001]), so the pipeline exists.
Measured: **96 KB minified, 35 ms**. Bundling is cheap because the library's external
imports are only pure helpers — `min-dom`, `min-dash`, `tiny-svg`, `inherits-browser`,
`randomcolor`, `ids`, `@bpmn-io/diagram-js-canvas-lock`, plus three utility modules
(`bpmn-js/lib/util/ModelUtil`, `DrilldownUtil`, `diagram-js/lib/util/EscapeUtil`).
bpmn-js itself is *not* pulled in, and nothing depends on class identity, so the
duplicated helpers cannot clash with the already-loaded `bpmn-modeler.production.min.js`
(diagram-js resolves DI by name). Icons are pre-inlined as strings by the package's own
rollup step — no JSX, no asset loaders.

`sync-libs.js` currently only knows `minify: true` (a `transformSync` over one file).
This needs a second capability: bundle from an entry point. Suggested entry —

```js
export { default as TokenSimulationModule } from 'bpmn-js-token-simulation/lib/base';
```

`lib/base` deliberately, **not** `lib/index` (= `lib/modeler`) or `lib/viewer`: both of
those only add a `ToggleMode` widget we do not want (see "Turning it on"). Two files
land in `libs/bpmn-js-token-simulation/`: the bundle and
`assets/css/bpmn-js-token-simulation.css` (12 KB, self-contained — no `url()`
references, so nothing else to copy).

### Wiring into the differ

- `bpmn-differ.js:368 #createModeler()` — add the module to `additionalModules`.
  The differ already renders through a full `BpmnJS` **Modeler** (BUG-0011), which is
  what the library needs; no viewer/modeler swap.
- `manifest.json#web_accessible_resources` + `utils.js#loadScripts` — the new js + css,
  loaded after bpmn-js.
- `sync-libs.js` + `package.json` — the package and the bundling step.

### Turning it on

The library's own toggle widgets are avoidable. Activation is just an event:

```js
canvasParent.classList.add('simulation');            // the CSS keys off this
eventBus.fire('tokenSimulation.toggleMode', { active: true });
```

That is exactly what `lib/features/toggle-mode/viewer/ToggleMode.js` does. Driving it
from the differ's own toolbar button keeps the UI consistent and avoids a stray widget;
it is also why `lib/base` is the right bundle entry. `lib/modeler`'s ToggleMode does
`domQuery('.djs-palette', …)` and hides the palette — needless coupling to a palette the
differ already hides by CSS.

While active, the library locks the canvas itself via `@bpmn-io/diagram-js-canvas-lock`
(`DisableModeling`), independently of the BUG-0011 `EDIT_EVENTS` veto. The two coexist;
no need to relax the existing vetoes.

### Coverage — wider than the original scope

`ElementSupport.js` lists exactly one unsupported type: **`bpmn:ComplexGateway`**. The
simulator ships behaviors for start/end/intermediate/boundary events, exclusive,
parallel, inclusive and event-based gateways, sub-processes, transactions, ad-hoc
sub-processes, message flows, and timer/message/signal/error/escalation/compensation/
link/terminate event definitions.

**Call Activity is handled by `ActivityBehavior`** — i.e. as a single opaque node,
precisely the behavior the statement asks for, at no cost.

Consequence: the MVP element list is not a build list, it is a *test* list. Nothing has
to be implemented per element type; the work is verifying behavior on real diagrams.

### The one real conflict: colors

`DiffHighlighter` (`diff-highlighter.js:40,63`) paints the diff with
`modeling.setColor`, which writes into the model (`di.fill`). The simulation's
`ElementColors` instead repaints through `graphicsFactory.update()` — rendering only, no
command stack, no model mutation, so it cannot dirty the document. But `base.js` also
pulls in `NeutralElementColors`, which flattens element colors while simulation is
active — visually wiping the diff highlighting.

This is the main thing to settle before coding, and it drives the UX question below.

### Suggested shape: a `simulate` mode tab

`DifferParams` already has the seam, built for FEAT-0031: `MODE_VIEW`/`MODE_EDIT`
(`differ-params.js:10-11,65-73`), a mode suffix in `identityKeyFor()` (:99-118) so tabs
dedup per mode, `toEditDifferParams()` (:152) for opening the same file in another mode,
and `editIdentityKey()` (:143) so a second press focuses the open tab instead of starting
a second session. `bpmn-differ.js:686 #isEditMode()` and `bpmn-differ-view.js:390` read it;
the toolbar button is `bpmn-differ-view.js:523`.

A `MODE_SIMULATE` + `simulateSide` would follow that pattern one-for-one, and the colors
conflict disappears: a simulate tab shows one version and paints no diff. Cost: another
mode to thread through `DifferParams`, and the unknown-mode guard that throws in
`differ-params.js:66-68` needs extending.

The alternative — an in-place toggle in the view tab — is less code but has to save and
restore the diff coloring around each simulation run. See the open question below.

### Testing

Unit tests cannot cover this: the library is only exercised in a browser and the project's
node tests never load `libs/`. Testable in isolation: the `DifferParams` mode/identity-key
changes (`test/differ/shared/differ-params.test.js` already covers the edit-mode keys —
mirror those cases). Everything else is a manual pass, plus possibly a Playwright e2e
(`npm run test:e2e`) driving one simulation on a fixture diagram.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-08-29 (2) · claude-opus-5 · branch `feature/feat-0031-bpmn-edit-mode`

Reprioritised `medium` → `low` after checking the feature against the defects actually
found in review here. The frequent one is variables passed into a Call Activity
incorrectly, and a token simulator is structurally incapable of seeing it — no variables,
Call Activity as one opaque node, no expression evaluation. Split that need out as
[FEAT-0032] and rewrote the statement to say plainly what this is and is not for. The
structural defects it does catch (gateway deadlocks, leaked tokens) are real but reportedly
not a problem on this project.

Also found, while checking the colour conflict: edit mode paints with **CSS markers**, not
`modeling.setColor` (`edit-diff-painter.js:3`, deliberately, to keep the command stack
clean). Diff mode's colours live in the model (`di.fill`) and so get flattened by
`NeutralElementColors`; CSS classes on the element sit outside what `graphicsFactory`
re-renders and most likely survive. If that holds in a browser, the colour conflict exists
in the diff and not in the editor — which points at pairing simulation with edit mode
first. Not verified: no browser check was run.

### 2026-08-29 · claude-opus-5 · branch `feature/feat-0031-bpmn-edit-mode`

Feasibility research only, no implementation. Findings written up in "Implementation
notes" above; the ESM-only packaging was the open risk and it is resolved (esbuild,
96 KB / 35 ms, probe run in a scratch dir). Also corrected the statement's scope list:
the library covers timers/messages/signals/sub-processes out of the box, and Call
Activity as a single node, so those are verification work rather than implementation
work.

Blocked on the UX decision recorded under "Open questions" — the diff-coloring conflict
makes tab-vs-toggle a design choice, not a detail.

## Open questions

1. **A separate `simulate` tab, or a toggle inside the view tab?** Drives everything
   else. A tab reuses the FEAT-0031 mode seam and sidesteps the color conflict, at the
   price of one more mode. A toggle is cheaper but must preserve and restore the diff
   coloring around each run. Partly narrowed by the second work-log entry: the conflict
   looks like it applies to the diff colours only, so a toggle *inside edit mode* may be
   the cheap option that costs nothing — needs a browser check first.
2. **Which side gets simulated in an MR diff** — source or target? Falls out of (1): a
   tab needs an explicit `simulateSide` (like `editSide`); a toggle simulates whatever
   version is on screen.
3. **Keep the properties panel visible during simulation?** It is read-only in view mode
   anyway (BUG-0014), but it competes for width with the simulation's own log/scope UI.
4. **Leave the extra element coverage enabled?** Timers, messages, signals and
   sub-processes work out of the box. Restricting to the original MVP list would be
   deliberate extra work; the assumption in these notes is to leave them on and simply
   not promise them.
5. **Opening arbitrary local `.bpmn` files** (mentioned in Context) is assumed to be a
   separate feature, not part of this one. Confirm.
