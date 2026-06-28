# Layer-2 Phase 4b: BPMN diff depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the BPMN differ's Layer-2 e2e coverage beyond the single shipped "added" case — the **removed** and **changed** diff directions on the canvas, the BUG-0010 subprocess regression case, the highlight button disabled in branch-only mode, property-group + list-item panel highlighting with direction inversion, FEAT-0029 auto-expand on both axes, changes-table depth (removed/changed rows, counter text, resetSelection, clear), and condition direction inversion.

**Architecture:** Each task adds one `test/e2e/differ-*.spec.js` that boots the real `BpmnDiffer` in Chromium via the existing `bootBpmnDiffer` helper with an in-memory `FakePlatformClient`. BPMN diff highlight is **OFF by default** (unlike DMN) — the canvas tests click the ☼ button, then assert the `highlight-diff` **marker class** (its colour comes from `styles.css` and from `modeling.setColor`, neither cheap to assert — the class is the robust signal, exactly as in the existing `differ-highlight.spec.js`). The properties-panel highlighter sets diff colours **inline** (`style.backgroundColor`), so those ARE assertable by `toHaveCSS` regardless of `styles.css`. Several cases reuse the existing default `base.bpmn`/`added-task.bpmn` pair (swapping refs for the removed direction); the changed/condition/subprocess/mappings cases need new **DI-bearing** fixtures under `test/e2e/fixtures/`.

**Tech Stack:** Vanilla JS (ES6+), `@playwright/test` (dev-only runner), `node:test` (unit, unaffected), the existing Layer-2 harness (`test/e2e/harness/differ-harness.html` — now loads `src/differ/styles.css`, Phase 4a — `test/e2e/support/boot-differ.js`, `fake-platform-client.js`, `static-server.js`).

## Global Constraints

- Vanilla JS (ES6+), no build step, **no new runtime dependencies**; `@playwright/test` is the already-agreed dev dependency. (CLAUDE.md)
- E2E files are named `*.spec.js` — **never** `*.test.js` (the `node:test` glob `test/**/*.test.js` must keep ignoring them; the Playwright `testMatch` is `**/*.spec.js`). (docs/testing.md, playwright.config.js)
- `npm test` (unit) stays unit-only and fast; e2e is the separate `npm run test:e2e` (= `playwright test`). (docs/testing.md)
- All code comments and docs are in **English only**. (CLAUDE.md)
- **master is protected** — do all work on a feature branch (e.g. `feature/e2e-phase4b`); completing the work = push the branch + open an MR after green tests, without separate permission. Merge is the human's. (CLAUDE.md, docs/git-workflow.md)
- Shared differ-page classes are used by both differs — but this plan adds **tests + fixtures only** (plus new `boot-differ.js` exports), **no production differ-code changes**, so the DMN side is unaffected.
- These are **characterization / integration tests of shipped behaviour**: a test is expected to PASS once written (and once its fixture exists). If a freshly written assertion of existing behaviour goes RED, do **not** loosen it to match and do **not** touch `src/` — a red means a real `bpmn-js` / `bio-properties-panel` selector drift or a bug; investigate with superpowers:systematic-debugging (inspect the `[pageerror]` / `[console.error]` lines and the retained trace).
  - **One deliberate exception, Task 4 (BUG-0010):** that test pins the *current, acknowledged-buggy* behaviour (subprocess NOT highlighted), mirroring the existing unit test `flags a changed inner element but not the enclosing subprocess`. When BUG-0010 is eventually fixed it is *expected* to go red and be updated together with that unit test — the task documents this so a future fixer knows.

**⚠️ FIXTURE NAME-COLLISION CHECK (the hard lesson from Phase 4a).** Before creating ANY new fixture, run `ls test/fixtures/ test/e2e/fixtures/` and confirm the basename is free. In 4a the plan named a "new" `changed-rule.dmn` that already existed as a unit-test golden and an implementer clobbered it. Note that `test/fixtures/changed-name.bpmn` and `test/fixtures/changed-condition.bpmn` **already exist** as *semantic (no-DI)* unit fixtures — this plan's DI-bearing e2e fixtures therefore use **distinct basenames** (`changed-task-name.bpmn`, `changed-flow-condition.bpmn`, …) under `test/e2e/fixtures/`, never reusing or modifying the semantic ones.

**Reference — DiffType colours (`src/differ/shared/diff-type.js`), as computed `rgb()`:**
- ADD `shapeColor #88ff88` → `rgb(136, 255, 136)` (green)
- CHANGE `shapeColor #8888ff` → `rgb(136, 136, 255)` (blue)
- REMOVE `shapeColor #ff8888` → `rgb(255, 136, 136)` (red)

**Reference — canvas highlight markers (`src/differ/bpmn/diff-highlighter.js`), verified:**
- `highlight-diff` = steady thin outline; `highlight-diff-big` = thick outline used by a changes-table row selection; `highlight-diff-pulse` = the 1.5 s attention blink applied first by `setEnabled(true)`, then swapped for `highlight-diff`. **All three are the SAME class for every direction (added/removed/changed)** — direction shows only as the painted `modeling.setColor` fill/stroke, which this plan does not assert. The canvas tests assert the class via `toHaveClass(/highlight-diff/)`.
- The set of highlighted elements = `setDiffElementIds([...missingShapeIds, ...missingRowIds, ...changedShapeIds, ...changedRowIds])` (`bpmn-differ.js#paintDiffs`). So a *removed* element is highlighted only on the side where it is rendered (after Switch), and a *changed* element is highlighted because it sits in `changedShapeIds`/`changedRowIds`.

**Reference — how the differ wires each side (`bpmn-differ.js`), verified:**
- `show()` renders the **MR (source) side first** when `mrXml` exists: `#showMr()` → `compare(mrXml, branchXml)`, `#paintDiffs(diff, DiffType.ADD)`. Switching runs `#showBranch()` → `compare(branchXml, mrXml)`, `#paintDiffs(diff, DiffType.REMOVE)`.
- Branch-only mode = `!params.isSourceVersionDefined()` (no `sourceRef` AND no `localFileContent`): the ☼ Highlight button and the "Switch branch" button are created **disabled**, and the **footer is not created at all** (no changes table / "Show changes" button) — `bpmn-differ-view.js:180,367,390`.
- Switching to a side where the file is absent → `#showAbsentSide(targetSide)`: `bpmnJS.clear()`, `changesTableView.clear()`, `setHighlightButtonEnabled(false)`, `setDownloadButtonEnabled(false)`, and `branchIndicator.setAbsentLabel(...)` → `"<role> · <label> · file does not exist"` (italic, grey `rgb(128,128,128)`). BPMN shows **no** empty-state cover for a one-sided absence (the cover is only for the both-absent case).
- Selection persists across Switch: `#showXml` captures the current selection before re-import and re-selects it after, so a selected element stays selected on the other side.

**Reference — changes table (`changes-table-view.js`) + footer (`bpmn-differ-view.js#createFooter`), verified:**
- The footer counter cells are **always visible** (only the table *body* `div` is `display:none` until "Show changes"). Row-1 cells in order: `Changed:` (static label) · changed-value · `Added:`/`Removed:` (dynamic label) · added/removed-value · "Show changes" button.
- Counter value text = `` `${elems.length} elements (${rowIds.length} rows)` `` for each of changed and missing. The dynamic label is `'Added:'` on the MR side (`diffTypeForMissing === ADD`) and `'Removed:'` on the base side.
- A data row's first cell text = `diffType.name` (`'added'` / `'removed'` / `'changed'`), `backgroundColor = diffType.shapeColor`; then `Id`, `Name`, `Type` (the `bpmn:` prefix stripped), `Propepties` [sic].
- `clear()` (absent side) sets the changed value, the added/removed label, and the added/removed value text nodes to `''` and empties the table; the static `Changed:` label cell is NOT cleared.
- `resetSelection()` repaints the selected row white and removes `highlight-diff-big` from the selected element; it is called when the table is **hidden** via "Show changes"→"Hide changes" (`bpmn-differ-view.js:537`) and inside `clear()`.

**Reference — properties panel (`properties-panel-highlighter.js`, `properties-group-expander.js`, `utils.js#findPropertiesGroupHeader`), verified against the frozen `test/fixtures/properties-panel.html`:**
- `findPropertiesGroupHeader(name)` returns the `.bio-properties-panel-group-header` element (the `.bio-properties-panel-group-header-title`'s parent), matched by the title's exact `textContent`.
- Group-header highlight: that header gets `style.backgroundColor = '#8888ff'` (`GROUP_COLOR`, always blue for "this group changed").
- List-item highlight: each `.bio-properties-panel-collapsible-entry-header-title` whose `textContent.trim()` equals a changed entry's label (its `target`/`name` attr — rendered by the real panel as `<code>label</code>`, so textContent === label) → its **parent** (`.bio-properties-panel-collapsible-entry-header`) gets `#8888ff` if `changed`, else `#88ff88` (MR shown) / `#ff8888` (base shown) — direction inversion.
- Auto-expand marks an open group by the `open` class on the **header** element (`.bio-properties-panel-group-header`); the expander clicks the header only when not already `open`. Axis A = changed groups (`nodeIdToDiffsMap`); Axis B = `relevantGroupsForElement` (e.g. ServiceTask→`Implementation`, gateway-source flow→`Condition`, UserTask→`Forms`). Each element auto-expands once.
- Condition: `showConditionExpression` injects `div.properties-condition` (id `bpmnPropsCondition_12345bf3d4e842caa0d88194431197c0`, `dataset.conditionFor === elementId`) next to the native field; each formatted line is a child `<div>` (whiteSpace `pre`). A line present on the shown side but absent on the other gets `backgroundColor` `#88ff88` (MR shown) / `#ff8888` (base shown). The conditions map is populated only when the flow is a **changed row** with a condition on both sides.

---

## File Structure

New spec files (all under `test/e2e/`):
- `differ-highlight-removed.spec.js` — Task 1 (removed element gets the marker after ☼, base side)
- `differ-highlight-changed.spec.js` — Task 2 (changed element gets the marker after ☼, MR side)
- `differ-highlight-branch-only.spec.js` — Task 3 (☼ + Switch disabled, no footer in branch-only mode)
- `differ-subprocess-bug-0010.spec.js` — Task 4 (BUG-0010: changed child highlighted, subprocess NOT)
- `differ-changes-table-changed.spec.js` — Task 5 (changed row + "Changed: 1 elements (0 rows)")
- `differ-changes-table-removed.spec.js` — Task 6 (removed row + "Removed: 1 elements (1 rows)")
- `differ-changes-table-state.spec.js` — Task 7 (resetSelection on hide; clear() on absent side)
- `differ-auto-expand-type.spec.js` — Task 8 (FEAT-0029 Axis B: ServiceTask→Implementation opens)
- `differ-condition-inversion.spec.js` — Task 9 (FEAT-0029 Axis A: Condition opens; condition green→red on switch)
- `differ-prop-group-highlight.spec.js` — Task 10 (changed group header blue; list items blue/green by direction)

New DI-bearing fixtures (all under `test/e2e/fixtures/` — basenames verified free of collisions):
- `changed-task-name.bpmn` — Task 2 & 5 (`base.bpmn` with Task_1 renamed)
- `subprocess-base.bpmn` + `subprocess-changed-child.bpmn` — Task 4
- `changed-flow-condition.bpmn` — Task 9 (`base.bpmn` with Flow_2's condition changed)
- `call-activity-in-base.bpmn` + `call-activity-in-changed.bpmn` — Task 10

Modified:
- `test/e2e/support/boot-differ.js` — Tasks 2, 4, 9, 10 add `read()` constants + extend the `module.exports` BPMN line. Tasks 1, 3, 5, 6, 7, 8 reuse existing exports and do NOT touch it.

**Out of scope for 4b (deferred, with rationale):** search navigation, toolbar/header (file-path FEAT-0026, download, update FEAT-0012, splitter/hide persistence, modes, BUG-0022 geometry) → Phase 4c. Navigation click flows (dive-in click, handler/correlation badges) → Phase 4d. DMN input/output **column** add/remove (carried over from 4a) → fold into 4c/4d alongside the other selector-fragile work. Asserting the *painted colour* (not just the class) of a canvas marker — `modeling.setColor` writes SVG fill/stroke on inner shapes, not a CSS-assertable property, and is already covered by `bpmn-xml-comparator` unit tests; the class is the Layer-2 signal.

---

### Task 1: Removed-direction canvas marker (base side, ref swap — no new fixture)

**Files:**
- Create: `test/e2e/differ-highlight-removed.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `BASE_BPMN`, `ADDED_TASK_BPMN` from `./support/boot-differ`.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, BASE_BPMN, ADDED_TASK_BPMN
} = require('./support/boot-differ');

// Mirror of the shipped "added" highlight test (differ-highlight.spec.js) with the
// versions swapped, to exercise the REMOVE direction the existing test never touches.
// The base (target) side has the extra Task_2; the MR removed it. show() renders the
// MR side first (2 elements, nothing to remove); "Switch branch" shows the base side,
// where Task_2 is REMOVED and is part of setDiffElementIds. Turning the diff highlight
// on (☼) marks it with the same `highlight-diff` class (the colour, red, comes from
// modeling.setColor + styles.css and is not asserted — the class is the robust signal).
test('marks a removed element when the highlight is on (base side)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'base-sha': ADDED_TASK_BPMN, 'mr-sha': BASE_BPMN } }
    });

    // MR side first: only 2 elements, Task_2 not present yet.
    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Switch branch' }).click();

    const removedTask = page.locator('svg .djs-element[data-element-id="Task_2"]');
    await expect(removedTask).toBeVisible();
    // Off by default.
    await expect(removedTask).not.toHaveClass(/highlight-diff/);

    await page.getByTitle('Turn diff highlight on').click();
    await expect(page.getByTitle('Turn diff highlight off')).toBeVisible();

    // The removed element now carries the highlight marker (pulse, then steady).
    await expect(removedTask).toHaveClass(/highlight-diff/);
    await expect(removedTask).toHaveClass(/(^|\s)highlight-diff(\s|$)/, { timeout: 3000 });
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test test/e2e/differ-highlight-removed.spec.js`
Expected: PASS (characterizes shipped behaviour). A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-highlight-removed.spec.js
git commit -m "test(e2e): cover BPMN removed-direction diff highlight (Layer-2 4b)"
```

---

### Task 2: Changed-direction canvas marker (MR side) + `changed-task-name.bpmn` fixture

**Files:**
- Create: `test/e2e/fixtures/changed-task-name.bpmn` (DI-bearing; basename is free — verify with `ls test/e2e/fixtures/`)
- Modify: `test/e2e/support/boot-differ.js` (add + export `CHANGED_TASK_NAME_BPMN`)
- Create: `test/e2e/differ-highlight-changed.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `BASE_BPMN`, and the **new** `CHANGED_TASK_NAME_BPMN` from `./support/boot-differ`.
- Produces: `CHANGED_TASK_NAME_BPMN` — contents of `test/e2e/fixtures/changed-task-name.bpmn`, exported from `boot-differ.js` (consumed by this task and Task 5).

- [ ] **Step 1: Create the fixture `test/e2e/fixtures/changed-task-name.bpmn`** (identical to `test/e2e/fixtures/base.bpmn`, with Task_1's name `Review request` → `Approve request`; DI unchanged)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task_1" name="Approve request">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${approved == true}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="82" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="240" y="60" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="392" y="82" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="100" />
        <di:waypoint x="240" y="100" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="340" y="100" />
        <di:waypoint x="392" y="100" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```

- [ ] **Step 2: Add and export the constant in `test/e2e/support/boot-differ.js`**

Add after the `CALL_ACTIVITY_BPMN` line (currently line 16):

```js
const CALL_ACTIVITY_BPMN = read('test/e2e/fixtures/call-activity.bpmn');
const CHANGED_TASK_NAME_BPMN = read('test/e2e/fixtures/changed-task-name.bpmn');
```

Extend the `module.exports` BPMN line (currently line 108) to:

```js
    BASE_BPMN, ADDED_TASK_BPMN, CALL_ACTIVITY_BPMN, CHANGED_TASK_NAME_BPMN, BPMN_FIXTURES,
```

- [ ] **Step 3: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, BASE_BPMN, CHANGED_TASK_NAME_BPMN
} = require('./support/boot-differ');

// changed-task-name.bpmn keeps base's structure but renames Task_1
// ("Review request" → "Approve request"). compare(mr, branch) flags Task_1 as a
// CHANGED shape (changedShapeIds), so it joins setDiffElementIds. Turning the diff
// highlight on (☼) marks it with `highlight-diff` — exercising the changed direction
// that the shipped added-only test never covers. The colour (blue) is not asserted.
test('marks a changed element when the highlight is on (MR side)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: { xmlByRef: { 'base-sha': BASE_BPMN, 'mr-sha': CHANGED_TASK_NAME_BPMN } }
    });

    const changedTask = page.locator('svg .djs-element[data-element-id="Task_1"]');
    await expect(changedTask).toBeVisible();
    await expect(changedTask).not.toHaveClass(/highlight-diff/);

    await page.getByTitle('Turn diff highlight on').click();
    await expect(page.getByTitle('Turn diff highlight off')).toBeVisible();

    await expect(changedTask).toHaveClass(/highlight-diff/);
    await expect(changedTask).toHaveClass(/(^|\s)highlight-diff(\s|$)/, { timeout: 3000 });
});
```

- [ ] **Step 4: Run the test**

Run: `npx playwright test test/e2e/differ-highlight-changed.spec.js`
Expected: PASS. A red is a real finding — investigate, do not loosen.

- [ ] **Step 5: Commit**

```bash
git add test/e2e/fixtures/changed-task-name.bpmn test/e2e/support/boot-differ.js test/e2e/differ-highlight-changed.spec.js
git commit -m "test(e2e): cover BPMN changed-direction diff highlight (Layer-2 4b)"
```

---

### Task 3: BUG-0025 — ☼ highlight enabled in branch-only mode (fix + regression test)

**REFRAMED during execution (user-confirmed bug).** The gap analysis (item B4) expected the ☼ Highlight button to be *disabled* in branch-only mode. Reality: the view DOES construct it disabled (`bpmn-differ-view.js:390`, `disabled: !isSourceVersionDefined()`), **but** `bpmn-differ.js#showXml` unconditionally calls `setHighlightButtonEnabled(true)` on every side that has a diagram (`bpmn-differ.js:428`) — that line exists to re-enable the button when switching back from an absent side, but it also overrides the constructor's disabled state on the initial branch-only render. So at runtime the button ends up **enabled**, with nothing to highlight (no diff). The user confirmed this is a bug. This task fixes it and pins the fix with the e2e test. (The "Switch branch" button is constructed disabled and never re-enabled, and the footer is genuinely not built — those parts were already correct.)

This is a TDD bugfix: the test goes RED on current `src/` (button enabled), the one-line fix makes it GREEN. This is the ONE task in 4b that touches `src/` — authorized because the user confirmed the bug.

**Files:**
- Create: `docs/issues/archive/bugs/bug-0025-highlight-enabled-in-branch-only.md` (born `status: done`, in archive)
- Modify: `src/differ/bpmn/bpmn-differ.js` (the `#showXml` highlight re-enable condition, line ~428)
- Create: `test/e2e/differ-highlight-branch-only.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `BASE_BPMN` from `./support/boot-differ`.
- Produces: nothing other tasks consume.
- Touches `src/differ/bpmn/bpmn-differ.js` only; `setHighlightButtonEnabled` is a `BpmnDifferView` method with no DMN counterpart (the DMN differ auto-paints, no toggle), so the shared-class rule does not apply — confirm no DMN coupling.

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, BASE_BPMN
} = require('./support/boot-differ');

// Branch-only mode: no sourceRef and no localFileContent → isSourceVersionDefined()
// is false, so there is no diff to highlight. The ☼ Highlight button and "Switch
// branch" must be disabled, and no footer (changes table) is built (BUG-0025: before
// the fix, #showXml re-enabled ☼ unconditionally on render). The "mr ... is undefined"
// debug line is normal.
test('disables highlight and switch and omits the footer in branch-only mode', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ sourceRef: undefined, sourceLabel: undefined }),
        fixtures: { xmlByRef: { 'base-sha': BASE_BPMN } }
    });

    // The target diagram still renders.
    await expect(page.locator('svg .djs-element[data-element-id="Task_1"]')).toBeVisible();

    // Diff highlight cannot be turned on (no comparison side) — BUG-0025.
    await expect(page.getByTitle('Turn diff highlight on')).toBeDisabled();
    // There is nothing to switch to.
    await expect(page.getByRole('button', { name: 'Switch branch' })).toBeDisabled();
    // No footer → no changes table.
    await expect(page.getByRole('button', { name: 'Show changes' })).toHaveCount(0);
    await expect(page.locator('table.changes-table')).toHaveCount(0);
});
```

- [ ] **Step 2: Run the test to confirm it FAILS for the right reason**

Run: `npx playwright test test/e2e/differ-highlight-branch-only.spec.js`
Expected: FAIL on the `toBeDisabled()` line — `getByTitle('Turn diff highlight on')` resolves to an **enabled** button, because `#showXml` re-enabled it. (The other assertions pass.) This proves the test exercises the bug.

- [ ] **Step 3: Fix `src/differ/bpmn/bpmn-differ.js`**

In `#showXml`, change the unconditional highlight re-enable so it respects whether a diff exists. Locate (around line 426-429):

```js
        // This side has a diagram/file — re-enable the Highlight and Download
        // buttons (disabled while an absent side is shown, see #showAbsentSide).
        this.#view.setHighlightButtonEnabled(true);
        this.#view.setDownloadButtonEnabled(true);
```

Replace the highlight line (leave Download unchanged — a single side is always downloadable):

```js
        // This side has a diagram/file — re-enable Download, and re-enable the
        // Highlight button only when there is a source version to diff against
        // (BUG-0025: in branch-only mode there is no diff, so ☼ stays disabled —
        // matching how the view constructs it, which #showXml used to override).
        this.#view.setHighlightButtonEnabled(this.#params.isSourceVersionDefined());
        this.#view.setDownloadButtonEnabled(true);
```

- [ ] **Step 4: Run the e2e test (GREEN) and the unit suite**

Run: `npx playwright test test/e2e/differ-highlight-branch-only.spec.js` → PASS.
Run: `npm test` → all green (the fix is a one-line condition; no unit test asserts the old unconditional enable, but confirm nothing regressed). Also run `npm run test:e2e` to confirm no other e2e spec regressed (the MR-mode specs still expect ☼ enabled — `isSourceVersionDefined()` is true there, so unchanged).

- [ ] **Step 5: Create the BUG-0025 issue (born done, in archive)**

Create `docs/issues/archive/bugs/bug-0025-highlight-enabled-in-branch-only.md`:

```markdown
---
id: BUG-0025
title: Diff-highlight (☼) button enabled in branch-only mode despite no diff
priority: low
status: done
---

## Statement

When the differ is opened on a single version (branch-only mode: only `targetRef`,
no `sourceRef` and no `localFileContent`), there is no diff to highlight. The ☼
"diff highlight" button should be disabled (as "Switch branch" is, and as the footer
is omitted), but it is shown **enabled** — clicking it toggles an empty highlight.

## Context

`BpmnDifferView` constructs the ☼ button disabled
(`bpmn-differ-view.js`, `disabled: !this.#params.isSourceVersionDefined()`), but
`BpmnDiffer#showXml` re-enables it unconditionally on every side that has a diagram:

```
this.#view.setHighlightButtonEnabled(true);
```

That line exists to restore the button after an absent side is shown
(`#showAbsentSide` disables it), but it also overrides the constructor's disabled
state on the initial branch-only render. Found while writing the Layer-2 e2e
coverage for branch-only mode (Phase 4b, item B4): the characterization test
expected "disabled" and went red.

### Fix

Gate the re-enable on `isSourceVersionDefined()`:

```
this.#view.setHighlightButtonEnabled(this.#params.isSourceVersionDefined());
```

Download stays unconditionally enabled (a single side is downloadable). BPMN-only:
`setHighlightButtonEnabled` has no DMN counterpart (DMN auto-paints, no toggle).

### Affected files

- `src/differ/bpmn/bpmn-differ.js` — `#showXml`
- `test/e2e/differ-highlight-branch-only.spec.js` — regression test (new, Phase 4b)

## Work log

<!-- newest first -->

### 2026-06-28 · claude-sonnet-4-6 · branch `feature/e2e-phase4b`

Found while writing Phase 4b branch-only e2e coverage. Gated the `#showXml`
highlight re-enable on `isSourceVersionDefined()` so ☼ stays disabled in
branch-only mode; Download unchanged. Regression pinned by the new
`differ-highlight-branch-only.spec.js`. e2e + unit suites green.
```

- [ ] **Step 6: Commit (test + fix + issue together)**

```bash
git add test/e2e/differ-highlight-branch-only.spec.js src/differ/bpmn/bpmn-differ.js docs/issues/archive/bugs/bug-0025-highlight-enabled-in-branch-only.md
git commit -m "fix(differ): keep ☼ highlight disabled in branch-only mode (BUG-0025)"
```

---

### Task 4: BUG-0010 — subprocess NOT highlighted when only a child changed (+ 2 fixtures)

**Files:**
- Create: `test/e2e/fixtures/subprocess-base.bpmn`, `test/e2e/fixtures/subprocess-changed-child.bpmn` (DI-bearing, expanded subprocess; basenames free — verify with `ls test/e2e/fixtures/`)
- Modify: `test/e2e/support/boot-differ.js` (add + export `SUBPROCESS_BASE_BPMN`, `SUBPROCESS_CHANGED_CHILD_BPMN`)
- Create: `test/e2e/differ-subprocess-bug-0010.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, the **new** `SUBPROCESS_BASE_BPMN`, `SUBPROCESS_CHANGED_CHILD_BPMN` from `./support/boot-differ`.
- Produces: those two constants (consumed only by this task).

This is a **regression pin** for the still-open BUG-0010: the comparator deliberately excludes subprocess children from the subprocess's own diff (`bpmn-xml-comparator.js#compareNodes`), so when only the inner `InnerTask_1` changes, **only `InnerTask_1`** is in `changedShapeIds`, never the enclosing `SubProcess_1`. The unit test `flags a changed inner element but not the enclosing subprocess` already locks this; this e2e locks it end-to-end. When BUG-0010 is fixed, this test is *expected* to go red — update it (and that unit test) then.

- [ ] **Step 1: Create `test/e2e/fixtures/subprocess-base.bpmn`** (expanded SubProcess_1 "UZ Issuance" containing InnerStart_1 → InnerFlow_1 → InnerTask_1 "Issue UZ")

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:subProcess id="SubProcess_1" name="UZ Issuance">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:startEvent id="InnerStart_1" name="Begin">
        <bpmn:outgoing>InnerFlow_1</bpmn:outgoing>
      </bpmn:startEvent>
      <bpmn:userTask id="InnerTask_1" name="Issue UZ">
        <bpmn:incoming>InnerFlow_1</bpmn:incoming>
      </bpmn:userTask>
      <bpmn:sequenceFlow id="InnerFlow_1" sourceRef="InnerStart_1" targetRef="InnerTask_1" />
    </bpmn:subProcess>
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="SubProcess_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="SubProcess_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="202" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubProcess_1_di" bpmnElement="SubProcess_1" isExpanded="true">
        <dc:Bounds x="240" y="140" width="410" height="180" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="InnerStart_1_di" bpmnElement="InnerStart_1">
        <dc:Bounds x="280" y="202" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="InnerTask_1_di" bpmnElement="InnerTask_1">
        <dc:Bounds x="380" y="180" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="InnerFlow_1_di" bpmnElement="InnerFlow_1">
        <di:waypoint x="316" y="220" />
        <di:waypoint x="380" y="220" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="720" y="202" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="220" />
        <di:waypoint x="240" y="220" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="650" y="220" />
        <di:waypoint x="720" y="220" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```

- [ ] **Step 2: Create `test/e2e/fixtures/subprocess-changed-child.bpmn`** (identical, but InnerTask_1's name `Issue UZ` → `Issue UZ v2`; everything else, including DI, unchanged)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:subProcess id="SubProcess_1" name="UZ Issuance">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:startEvent id="InnerStart_1" name="Begin">
        <bpmn:outgoing>InnerFlow_1</bpmn:outgoing>
      </bpmn:startEvent>
      <bpmn:userTask id="InnerTask_1" name="Issue UZ v2">
        <bpmn:incoming>InnerFlow_1</bpmn:incoming>
      </bpmn:userTask>
      <bpmn:sequenceFlow id="InnerFlow_1" sourceRef="InnerStart_1" targetRef="InnerTask_1" />
    </bpmn:subProcess>
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="SubProcess_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="SubProcess_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="202" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubProcess_1_di" bpmnElement="SubProcess_1" isExpanded="true">
        <dc:Bounds x="240" y="140" width="410" height="180" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="InnerStart_1_di" bpmnElement="InnerStart_1">
        <dc:Bounds x="280" y="202" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="InnerTask_1_di" bpmnElement="InnerTask_1">
        <dc:Bounds x="380" y="180" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="InnerFlow_1_di" bpmnElement="InnerFlow_1">
        <di:waypoint x="316" y="220" />
        <di:waypoint x="380" y="220" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="720" y="202" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="220" />
        <di:waypoint x="240" y="220" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="650" y="220" />
        <di:waypoint x="720" y="220" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```

- [ ] **Step 3: Add and export the constants in `test/e2e/support/boot-differ.js`**

Add after the `CHANGED_TASK_NAME_BPMN` line (added in Task 2):

```js
const CHANGED_TASK_NAME_BPMN = read('test/e2e/fixtures/changed-task-name.bpmn');
const SUBPROCESS_BASE_BPMN = read('test/e2e/fixtures/subprocess-base.bpmn');
const SUBPROCESS_CHANGED_CHILD_BPMN = read('test/e2e/fixtures/subprocess-changed-child.bpmn');
```

Extend the `module.exports` BPMN line to:

```js
    BASE_BPMN, ADDED_TASK_BPMN, CALL_ACTIVITY_BPMN, CHANGED_TASK_NAME_BPMN,
    SUBPROCESS_BASE_BPMN, SUBPROCESS_CHANGED_CHILD_BPMN, BPMN_FIXTURES,
```

- [ ] **Step 4: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, SUBPROCESS_BASE_BPMN, SUBPROCESS_CHANGED_CHILD_BPMN
} = require('./support/boot-differ');

// BUG-0010 (still OPEN) regression pin. Only InnerTask_1's name changed inside the
// expanded SubProcess_1. The comparator excludes a subprocess's children from the
// subprocess's own diff, so changedShapeIds = [InnerTask_1] only — the enclosing
// SubProcess_1 is NOT flagged: no changes-table row, no highlight marker. This locks
// the current (acknowledged-buggy) behaviour end-to-end, mirroring the unit test
// "flags a changed inner element but not the enclosing subprocess". WHEN BUG-0010 IS
// FIXED THIS TEST IS EXPECTED TO GO RED — update it (and that unit test) then; do NOT
// loosen it before the fix.
test('BUG-0010: highlights the changed child but not its enclosing subprocess', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: { xmlByRef: { 'base-sha': SUBPROCESS_BASE_BPMN, 'mr-sha': SUBPROCESS_CHANGED_CHILD_BPMN } }
    });

    // Reveal the changes table.
    await page.getByRole('button', { name: 'Show changes' }).click();
    const table = page.locator('table.changes-table');
    await expect(table).toBeVisible();

    // The changed child is listed as "changed"; the subprocess is NOT listed.
    const childRow = table.locator('tbody tr', { hasText: 'InnerTask_1' });
    await expect(childRow).toBeVisible();
    await expect(childRow).toContainText('changed');
    await expect(table.locator('tbody tr', { hasText: 'SubProcess_1' })).toHaveCount(0);

    // Counter: exactly one changed shape, no changed rows; nothing added.
    await expect(page.locator('td:has-text("Changed:") + td')).toHaveText('1 elements (0 rows)');

    // On the canvas, turning the highlight on marks the child but never the subprocess.
    await page.getByTitle('Turn diff highlight on').click();
    await expect(page.locator('svg .djs-element[data-element-id="InnerTask_1"]'))
        .toHaveClass(/highlight-diff/);
    await expect(page.locator('svg .djs-element[data-element-id="SubProcess_1"]'))
        .not.toHaveClass(/highlight-diff/);
});
```

- [ ] **Step 5: Run the test**

Run: `npx playwright test test/e2e/differ-subprocess-bug-0010.spec.js`
Expected: PASS — it characterizes today's behaviour. (If it fails because BUG-0010 was meanwhile fixed in `src/`, that is the one allowed reason to update the assertions — otherwise investigate per systematic-debugging.)

- [ ] **Step 6: Commit**

```bash
git add test/e2e/fixtures/subprocess-base.bpmn test/e2e/fixtures/subprocess-changed-child.bpmn test/e2e/support/boot-differ.js test/e2e/differ-subprocess-bug-0010.spec.js
git commit -m "test(e2e): pin BUG-0010 subprocess/child highlight behaviour (Layer-2 4b)"
```

---

### Task 5: Changes-table changed row + counter text (reuses `changed-task-name.bpmn`)

**Files:**
- Create: `test/e2e/differ-changes-table-changed.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `BASE_BPMN`, `CHANGED_TASK_NAME_BPMN` from `./support/boot-differ` (added in Task 2 — Task 5 depends on Task 2 having landed the export).
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, BASE_BPMN, CHANGED_TASK_NAME_BPMN
} = require('./support/boot-differ');

// Task_1 renamed → a single CHANGED shape on the MR side. The footer counters are
// visible without revealing the table body: "Changed: 1 elements (0 rows)" and, since
// nothing was added, the dynamic label stays "Added:" with "0 elements (0 rows)".
// Revealing the table shows one "changed" row for Task_1.
test('shows a changed row and the changed/added counters', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: { xmlByRef: { 'base-sha': BASE_BPMN, 'mr-sha': CHANGED_TASK_NAME_BPMN } }
    });

    // Counters are visible immediately (only the table body is hidden).
    await expect(page.locator('td:has-text("Changed:") + td')).toHaveText('1 elements (0 rows)');
    await expect(page.locator('td:has-text("Added:") + td')).toHaveText('0 elements (0 rows)');

    await page.getByRole('button', { name: 'Show changes' }).click();
    const table = page.locator('table.changes-table');
    await expect(table).toBeVisible();

    const row = table.locator('tbody tr', { hasText: 'Task_1' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('changed');
    await expect(row).toContainText('Approve request');
    await expect(row).toContainText('UserTask');
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test test/e2e/differ-changes-table-changed.spec.js`
Expected: PASS. A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-changes-table-changed.spec.js
git commit -m "test(e2e): cover changes-table changed row + counters (Layer-2 4b)"
```

---

### Task 6: Changes-table removed row + counter text (base side, ref swap — no new fixture)

**Files:**
- Create: `test/e2e/differ-changes-table-removed.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `BASE_BPMN`, `ADDED_TASK_BPMN` from `./support/boot-differ`.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, BASE_BPMN, ADDED_TASK_BPMN
} = require('./support/boot-differ');

// Swapped refs: the base (target) side has Task_2 (shape) + Flow_3 (row); the MR removed
// them. show() renders the MR side first (nothing removed there). After Switch, the base
// side fills the table for the REMOVE direction: the dynamic label becomes "Removed:",
// the counter "1 elements (1 rows)" (Task_2 shape + Flow_3 row), and a "removed" row is
// listed for Task_2.
test('shows a removed row and the removed counter after switching (base side)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'base-sha': ADDED_TASK_BPMN, 'mr-sha': BASE_BPMN } }
    });

    await page.getByRole('button', { name: 'Switch branch' }).click();

    await expect(page.locator('td:has-text("Removed:") + td')).toHaveText('1 elements (1 rows)');
    await expect(page.locator('td:has-text("Changed:") + td')).toHaveText('0 elements (0 rows)');

    await page.getByRole('button', { name: 'Show changes' }).click();
    const table = page.locator('table.changes-table');
    await expect(table).toBeVisible();

    const row = table.locator('tbody tr', { hasText: 'Task_2' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('removed');
    await expect(row).toContainText('Notify');
    await expect(row).toContainText('ServiceTask');
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test test/e2e/differ-changes-table-removed.spec.js`
Expected: PASS. A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-changes-table-removed.spec.js
git commit -m "test(e2e): cover changes-table removed row + counters (Layer-2 4b)"
```

---

### Task 7: Changes-table state — resetSelection on hide; clear() on the absent side

**Files:**
- Create: `test/e2e/differ-changes-table-state.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `ADDED_TASK_BPMN` from `./support/boot-differ`. (The default scenario `BPMN_FIXTURES` covers the first test.)
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the file with two tests**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, ADDED_TASK_BPMN
} = require('./support/boot-differ');

// Default scenario (MR side, Task_2 added). Selecting a changes-table row adds the
// big marker (highlight-diff-big) to the element; HIDING the table calls
// resetSelection(), which removes that marker.
test('resetSelection removes the big marker when the table is hidden', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    await page.getByRole('button', { name: 'Show changes' }).click();
    const taskRow = page.locator('table.changes-table tbody tr', { hasText: 'Task_2' });
    await taskRow.click();

    const addedTask = page.locator('svg .djs-element[data-element-id="Task_2"]');
    await expect(addedTask).toHaveClass(/highlight-diff-big/);

    await page.getByRole('button', { name: 'Hide changes' }).click();
    await expect(addedTask).not.toHaveClass(/highlight-diff-big/);
});

// New file in the MR (base-sha absent). NOTE (corrected during execution): with the
// target side absent there is no base to diff against, so #showMr computes diff=null
// and the changes table is NEVER populated — not even on the MR side (you cannot diff a
// new file). So clear() always clears an already-empty table; we therefore characterize
// the absent-SIDE end-state instead of a populated→empty transition. Switching to the
// absent base side runs #showAbsentSide → bpmnJS.clear() (canvas emptied — BPMN shows NO
// cover for a one-sided absence, unlike DMN) + changesTableView.clear() + disable
// Download/Highlight + the "file does not exist" label.
test('clears the canvas and changes table when switching to an absent (new-file) side', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': ADDED_TASK_BPMN } }   // base-sha missing → absent target (new file in MR)
    });

    // MR side renders the diagram (no diff computed — there is no base to compare).
    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]')).toBeVisible();

    // Switch to the absent base side → #showAbsentSide → bpmnJS.clear() + changesTable.clear().
    await page.getByRole('button', { name: 'Switch branch' }).click();

    // The canvas is cleared (no cover for a one-sided absence, unlike DMN); the Task_2
    // shape that was just visible is gone.
    await expect(page.locator('svg .djs-element')).toHaveCount(0);
    // The changes table is empty and the changed counter is blank.
    await expect(page.locator('table.changes-table tbody tr')).toHaveCount(0);
    await expect(page.locator('td:has-text("Changed:") + td')).toHaveText('');

    // The absence is spelled out in the label (italic, grey); Download and Highlight disable.
    const indicator = page.locator('.differ-toolbar span', { hasText: '·' });
    await expect(indicator).toContainText('file does not exist');
    await expect(indicator).toHaveCSS('color', 'rgb(128, 128, 128)');
    await expect(indicator).toHaveCSS('font-style', 'italic');
    await expect(page.getByTitle('Download the file as shown for the current branch')).toBeDisabled();
    await expect(page.getByTitle('Turn diff highlight on')).toBeDisabled();
});
```

- [ ] **Step 2: Run the file**

Run: `npx playwright test test/e2e/differ-changes-table-state.spec.js`
Expected: PASS (both tests). A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-changes-table-state.spec.js
git commit -m "test(e2e): cover changes-table resetSelection + absent-side clear (Layer-2 4b)"
```

---

### Task 8: Auto-expand FEAT-0029 Axis B — type-relevant group (ServiceTask → Implementation)

**Files:**
- Create: `test/e2e/differ-auto-expand-type.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics` from `./support/boot-differ` (default `BPMN_FIXTURES`).
- Produces: nothing other tasks consume.

Panel-DOM test (Layer-2's core value: it verifies the expander's header lookup still matches the real `bio-properties-panel`). Task_2 is the added `serviceTask` (`delegateExpression`); it is NOT in `nodeIdToDiffsMap` (added elements are not "changed"), so Axis A contributes nothing — selecting it must open `Implementation` purely via Axis B (`relevantGroupsForElement`). FEAT-0029 states groups are collapsed by default; the assertion is that the header gains the `open` class after selection.

- [ ] **Step 1: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// FEAT-0029 Axis B: selecting the added serviceTask Task_2 auto-expands the
// "Implementation" group (its defining group for ServiceTask), even though Task_2 has
// no recorded diff group (Axis A empty) — proving the type-relevant axis. The panel
// marks an open group with the `open` class on its header element.
test('auto-expands the type-relevant group (ServiceTask → Implementation)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    // The panel is mounted by show().
    await expect(page.locator('.bio-properties-panel-scroll-container')).toBeVisible();

    // Select the added serviceTask on the canvas.
    await page.locator('svg .djs-element[data-element-id="Task_2"]').click();

    // Its Implementation group header gains the `open` class (auto-expanded). Locate
    // by header text (the live bio-properties-panel does NOT set a `title` attribute on
    // group-header titles — only the frozen unit fixture does; production matches by
    // textContent). Pattern matches the shipped differ-view-only.spec.js.
    const implHeader = page.locator('.bio-properties-panel-group-header', { hasText: 'Implementation' });
    await expect(implHeader).toHaveClass(/(^|\s)open(\s|$)/);
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test test/e2e/differ-auto-expand-type.spec.js`
Expected: PASS. A red is a real finding (expander selector drift, or the group is open by default and not via auto-expand) — investigate per systematic-debugging, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-auto-expand-type.spec.js
git commit -m "test(e2e): cover FEAT-0029 Axis B type-relevant auto-expand (Layer-2 4b)"
```

---

### Task 9: Auto-expand Axis A + condition direction inversion (+ `changed-flow-condition.bpmn`)

**Files:**
- Create: `test/e2e/fixtures/changed-flow-condition.bpmn` (DI-bearing; basename free — verify with `ls test/e2e/fixtures/`)
- Modify: `test/e2e/support/boot-differ.js` (add + export `CHANGED_FLOW_CONDITION_BPMN`)
- Create: `test/e2e/differ-condition-inversion.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `BASE_BPMN`, the **new** `CHANGED_FLOW_CONDITION_BPMN` from `./support/boot-differ`.
- Produces: `CHANGED_FLOW_CONDITION_BPMN` — contents of `test/e2e/fixtures/changed-flow-condition.bpmn` (consumed only by this task).

Flow_2 (Task_1 → EndEvent_1, source is a task, not a gateway) carries a condition that **differs** between the sides. So Axis B contributes nothing for Flow_2; selecting it opens `Condition` purely via **Axis A** (the diff recorded the Condition group). The injected `div.properties-condition` colours the line unique to the shown side: green on the MR side (added), red after switching to the base side (removed) — the direction inversion. The `ConditionFormatter` turns `${approved == false}` into the lines `['${', '  approved == false', '}']`, so the differing middle line is the one that gets coloured.

- [ ] **Step 1: Create `test/e2e/fixtures/changed-flow-condition.bpmn`** (identical to `test/e2e/fixtures/base.bpmn`, with Flow_2's condition `${approved == true}` → `${approved == false}`; DI unchanged)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task_1" name="Review request">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${approved == false}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="82" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="240" y="60" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="392" y="82" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="100" />
        <di:waypoint x="240" y="100" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="340" y="100" />
        <di:waypoint x="392" y="100" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```

- [ ] **Step 2: Add and export the constant in `test/e2e/support/boot-differ.js`**

Add after the `SUBPROCESS_CHANGED_CHILD_BPMN` line (added in Task 4):

```js
const SUBPROCESS_CHANGED_CHILD_BPMN = read('test/e2e/fixtures/subprocess-changed-child.bpmn');
const CHANGED_FLOW_CONDITION_BPMN = read('test/e2e/fixtures/changed-flow-condition.bpmn');
```

Extend the `module.exports` BPMN line to:

```js
    BASE_BPMN, ADDED_TASK_BPMN, CALL_ACTIVITY_BPMN, CHANGED_TASK_NAME_BPMN,
    SUBPROCESS_BASE_BPMN, SUBPROCESS_CHANGED_CHILD_BPMN, CHANGED_FLOW_CONDITION_BPMN, BPMN_FIXTURES,
```

- [ ] **Step 3: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, BASE_BPMN, CHANGED_FLOW_CONDITION_BPMN
} = require('./support/boot-differ');

// Flow_2's condition differs between the sides (true ⇄ false) and its source is a task
// (not a gateway), so selecting it auto-expands "Condition" via Axis A only (the diff
// recorded that group). The injected div.properties-condition colours the line unique to
// the shown side: GREEN (added) on the MR side, RED (removed) after Switch — the
// direction inversion. Selection persists across Switch (the differ re-selects it).
test('auto-expands the changed Condition group and inverts the condition colour on switch', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: { xmlByRef: { 'base-sha': BASE_BPMN, 'mr-sha': CHANGED_FLOW_CONDITION_BPMN } }
    });

    await expect(page.locator('.bio-properties-panel-scroll-container')).toBeVisible();

    // Select the conditional flow (connection clicks route through the invisible hit zone).
    await page.locator('svg .djs-element[data-element-id="Flow_2"] .djs-hit').click({ force: true });

    // Axis A: the changed "Condition" group auto-expands. Locate by header text — the
    // live panel sets no `title` attribute on group-header titles (production matches by
    // textContent); pattern matches the shipped differ-view-only.spec.js.
    const conditionHeader = page.locator('.bio-properties-panel-group-header', { hasText: 'Condition' });
    await expect(conditionHeader).toHaveClass(/(^|\s)open(\s|$)/);

    // MR side: the line unique to this side ("approved == false") is painted green (add).
    const condition = page.locator('div.properties-condition');
    await expect(condition).toBeAttached();
    const mrLine = condition.locator('div', { hasText: 'approved' });
    await expect(mrLine).toHaveCSS('background-color', 'rgb(136, 255, 136)');

    // Switch to the base side: the differ re-selects Flow_2 and redraws the condition;
    // now "approved == true" is the line unique to the shown side → painted red (remove).
    await page.getByRole('button', { name: 'Switch branch' }).click();
    const baseLine = page.locator('div.properties-condition div', { hasText: 'approved' });
    await expect(baseLine).toHaveCSS('background-color', 'rgb(255, 136, 136)');
});
```

- [ ] **Step 4: Run the test**

Run: `npx playwright test test/e2e/differ-condition-inversion.spec.js`
Expected: PASS. A red is a real finding — investigate per systematic-debugging, do not loosen.

- [ ] **Step 5: Commit**

```bash
git add test/e2e/fixtures/changed-flow-condition.bpmn test/e2e/support/boot-differ.js test/e2e/differ-condition-inversion.spec.js
git commit -m "test(e2e): cover Axis-A auto-expand + condition direction inversion (Layer-2 4b)"
```

---

### Task 10: Property-group + list-item highlight by direction (+ 2 call-activity fixtures)

**Files:**
- Create: `test/e2e/fixtures/call-activity-in-base.bpmn`, `test/e2e/fixtures/call-activity-in-changed.bpmn` (DI-bearing, CallActivity with `camunda:in` mappings; basenames free — verify with `ls test/e2e/fixtures/`)
- Modify: `test/e2e/support/boot-differ.js` (add + export `CALL_ACTIVITY_IN_BASE_BPMN`, `CALL_ACTIVITY_IN_CHANGED_BPMN`)
- Create: `test/e2e/differ-prop-group-highlight.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, the **new** `CALL_ACTIVITY_IN_BASE_BPMN`, `CALL_ACTIVITY_IN_CHANGED_BPMN` from `./support/boot-differ`.
- Produces: those two constants (consumed only by this task).

The richest panel-DOM test, covering all three list-item directions. Base In mappings: `varIn`, `itemId`, `oldVar`. MR In mappings: `varIn` (source changed → `changed:true`), `itemId` (unchanged → no descriptor), `newVar` (added in MR → `changed:false`); `oldVar` is removed in the MR. Selecting the CallActivity: the comparator records the `In mappings` group, so the group header is painted blue (`#8888ff`); Axis A auto-expands `In mappings` so its list items render; the highlighter then paints the changed item blue and the added item green (`#88ff88`, MR side). Switching to the base side shows the **removed** direction: `oldVar` (base-only) is painted red (`#ff8888`) because the target side is shown — the inversion the MR side cannot show. The real panel renders an item header title as `<code>target</code>`, so `getByText(target, { exact: true })` matches it and its enclosing `.bio-properties-panel-collapsible-entry-header` carries the inline colour. (Use a `defaultBpmnParams()` whose `filePath`/`fileName` are `.bpmn` — the default — so the BPMN differ boots.)

- [ ] **Step 1: Create `test/e2e/fixtures/call-activity-in-base.bpmn`** (CallActivity_1 with two In mappings)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_2" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_2" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:callActivity id="CallActivity_1" name="Run sub-process" calledElement="Sub_Process">
      <bpmn:extensionElements>
        <camunda:in source="orderId" target="varIn" />
        <camunda:in source="customer" target="itemId" />
        <camunda:in source="legacy" target="oldVar" />
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:callActivity>
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="CallActivity_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="CallActivity_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_2">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="82" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="CallActivity_1_di" bpmnElement="CallActivity_1">
        <dc:Bounds x="240" y="60" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="392" y="82" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="100" />
        <di:waypoint x="240" y="100" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="340" y="100" />
        <di:waypoint x="392" y="100" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```

- [ ] **Step 2: Create `test/e2e/fixtures/call-activity-in-changed.bpmn`** (varIn's source changed; newVar added; itemId unchanged; DI identical)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_2" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_2" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:callActivity id="CallActivity_1" name="Run sub-process" calledElement="Sub_Process">
      <bpmn:extensionElements>
        <camunda:in source="orderNumber" target="varIn" />
        <camunda:in source="customer" target="itemId" />
        <camunda:in source="region" target="newVar" />
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:callActivity>
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="CallActivity_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="CallActivity_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_2">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="82" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="CallActivity_1_di" bpmnElement="CallActivity_1">
        <dc:Bounds x="240" y="60" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="392" y="82" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="100" />
        <di:waypoint x="240" y="100" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="340" y="100" />
        <di:waypoint x="392" y="100" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```

- [ ] **Step 3: Add and export the constants in `test/e2e/support/boot-differ.js`**

Add after the `CHANGED_FLOW_CONDITION_BPMN` line (added in Task 9):

```js
const CHANGED_FLOW_CONDITION_BPMN = read('test/e2e/fixtures/changed-flow-condition.bpmn');
const CALL_ACTIVITY_IN_BASE_BPMN = read('test/e2e/fixtures/call-activity-in-base.bpmn');
const CALL_ACTIVITY_IN_CHANGED_BPMN = read('test/e2e/fixtures/call-activity-in-changed.bpmn');
```

Extend the `module.exports` BPMN line to:

```js
    BASE_BPMN, ADDED_TASK_BPMN, CALL_ACTIVITY_BPMN, CHANGED_TASK_NAME_BPMN,
    SUBPROCESS_BASE_BPMN, SUBPROCESS_CHANGED_CHILD_BPMN, CHANGED_FLOW_CONDITION_BPMN,
    CALL_ACTIVITY_IN_BASE_BPMN, CALL_ACTIVITY_IN_CHANGED_BPMN, BPMN_FIXTURES,
```

- [ ] **Step 4: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams,
    CALL_ACTIVITY_IN_BASE_BPMN, CALL_ACTIVITY_IN_CHANGED_BPMN
} = require('./support/boot-differ');

// CallActivity_1's In mappings differ: varIn changed (source), newVar added in the MR,
// itemId unchanged, oldVar removed in the MR (base-only). Selecting it paints the
// "In mappings" group header blue (#8888ff), auto-expands it (Axis A) so its list items
// render, then colours the changed item blue and the added item green (#88ff88, MR side).
// Switching to the base side shows the removed item oldVar red (#ff8888) — the inversion.
// The real panel renders an item title as <code>target</code>, so its target text
// identifies the entry header.
test('highlights the changed group header and its list items by direction', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'base-sha': CALL_ACTIVITY_IN_BASE_BPMN, 'mr-sha': CALL_ACTIVITY_IN_CHANGED_BPMN } }
    });

    await expect(page.locator('.bio-properties-panel-scroll-container')).toBeVisible();
    await page.locator('svg .djs-element[data-element-id="CallActivity_1"]').click();

    // The changed group header is painted blue. Locate by header text — the live panel
    // sets no `title` attribute on group-header titles (production matches by
    // textContent); the header contains only the title ("In mappings"), while the list
    // entries live in a sibling .bio-properties-panel-list, so hasText is unambiguous.
    const groupHeader = page.locator('.bio-properties-panel-group-header', { hasText: 'In mappings' });
    await expect(groupHeader).toHaveCSS('background-color', 'rgb(136, 136, 255)');

    // The changed mapping (varIn) → blue; the added mapping (newVar) → green.
    const changedItem = page.locator('.bio-properties-panel-collapsible-entry-header', {
        has: page.getByText('varIn', { exact: true })
    });
    await expect(changedItem).toHaveCSS('background-color', 'rgb(136, 136, 255)');

    const addedItem = page.locator('.bio-properties-panel-collapsible-entry-header', {
        has: page.getByText('newVar', { exact: true })
    });
    await expect(addedItem).toHaveCSS('background-color', 'rgb(136, 255, 136)');

    // Removed direction (inversion): switch to the base side. CallActivity_1 stays
    // selected and the group stays open, so the highlighter re-runs for the base-side
    // diff. oldVar exists only in the base version (the MR removed it) → it is the
    // removed mapping, painted RED (#ff8888 → rgb(255,136,136)) because the target side
    // is shown — the colour the MR side cannot show. newVar is absent here.
    await page.getByRole('button', { name: 'Switch branch' }).click();
    const removedItem = page.locator('.bio-properties-panel-collapsible-entry-header', {
        has: page.getByText('oldVar', { exact: true })
    });
    await expect(removedItem).toHaveCSS('background-color', 'rgb(255, 136, 136)');
});
```

- [ ] **Step 5: Run the test**

Run: `npx playwright test test/e2e/differ-prop-group-highlight.spec.js`
Expected: PASS. A red is a real finding (highlighter/expander selector drift, or the In-mapping list-item title is no longer the bare target text) — investigate per systematic-debugging, do not loosen.

- [ ] **Step 6: Commit**

```bash
git add test/e2e/fixtures/call-activity-in-base.bpmn test/e2e/fixtures/call-activity-in-changed.bpmn test/e2e/support/boot-differ.js test/e2e/differ-prop-group-highlight.spec.js
git commit -m "test(e2e): cover property-group + list-item highlight by direction (Layer-2 4b)"
```

---

## Final verification (before MR)

- [ ] Run the whole e2e suite: `npm run test:e2e` → all green (the 22 prior Layer-2 specs + the 10 new 4b ones; ~12 new test cases).
- [ ] Run the unit suite to confirm it is untouched: `npm test` → all green (these tasks add no `*.test.js` and no production code; `test/fixtures/changed-name.bpmn` and `changed-condition.bpmn` must be unchanged — `git status` should show only additions under `test/e2e/`).
- [ ] Update docs: in `docs/testing.md`, extend the e2e "Scope so far" paragraph to mention the BPMN removed/changed diff-highlight directions, the BUG-0010 subprocess pin, branch-only disabling, changes-table removed/changed rows + counters + resetSelection/clear, FEAT-0029 auto-expand (Axis A + Axis B), property-group + list-item highlight, and condition direction inversion. Update the memory note `layer2-e2e-coverage.md` to mark Phase 4b done (new fixtures: `changed-task-name.bpmn`, `subprocess-base.bpmn`, `subprocess-changed-child.bpmn`, `changed-flow-condition.bpmn`, `call-activity-in-base.bpmn`, `call-activity-in-changed.bpmn`; reused the default `base.bpmn`/`added-task.bpmn` pair with ref swaps).
- [ ] Push the feature branch and open the MR into master (via the `mr` skill), after green tests. Merge is the human's.

## Self-Review notes (author)

- **Spec coverage vs gap-analysis area B/C/D + condition inversion:** removed direction ✓ (T1), changed direction ✓ (T2), highlight disabled branch-only ✓ (T3), BUG-0010 ✓ (T4), changes-table changed row + counters ✓ (T5), removed row + counters ✓ (T6), resetSelection + clear() ✓ (T7), FEAT-0029 Axis B ✓ (T8), FEAT-0029 Axis A ✓ (T9), property-group header + list-item by direction ✓ (T10), condition direction inversion ✓ (T9). Row ordering by XML document order (area D) is implicitly exercised but not separately asserted — low protection, omitted to keep tasks focused.
- **Type/name consistency:** new `boot-differ.js` constants are `CHANGED_TASK_NAME_BPMN` (T2), `SUBPROCESS_BASE_BPMN`/`SUBPROCESS_CHANGED_CHILD_BPMN` (T4), `CHANGED_FLOW_CONDITION_BPMN` (T9), `CALL_ACTIVITY_IN_BASE_BPMN`/`CALL_ACTIVITY_IN_CHANGED_BPMN` (T10); each task appends its `read()` line right after the previously-added one and extends the single `module.exports` BPMN line, which after T10 reads exactly the block shown in T10 Step 3. Tasks 5 and 6 reuse `CHANGED_TASK_NAME_BPMN`/`ADDED_TASK_BPMN` — T5 depends on T2's export having landed (note the dependency in the task order).
- **No placeholders:** every test, fixture, edit, command, and expected outcome is spelled out in full.
- **Fixture-collision discipline:** all six new fixtures use basenames absent from both `test/fixtures/` and `test/e2e/fixtures/`; the semantic `changed-name.bpmn`/`changed-condition.bpmn` are deliberately not reused (different directory, no DI, unit-test goldens).
- **Risk note (Tasks 8–10):** these assert against the live `bio-properties-panel` DOM and the highlight/auto-expand timing (the highlighter polls while the expander opens the group concurrently). That coupling is exactly the third-party-drift surface Layer-2 exists to guard, and it is shipped/working behaviour — so PASS is expected; a red is a genuine signal, not a reason to weaken the assertion.
