# E2E Testing — Phase 2 (rest of the Layer-2 differ checklist + DMN boot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the green Layer-2 harness (Phase 1 + 1b), add the remaining differ-checklist feature tests — zoom/fit, hide/show properties, empty/absent states, view-only copy invariants (BUG-0014/0015), the Call Activity dive-in overlay — plus a DMN boot/render smoke test via a new `bootDmnDiffer` sibling helper.

**Architecture:** Same harness as Phase 1b: boot the real `BpmnDiffer`/`DmnDiffer` in Chromium with an injected `FakePlatformClient`, all data in-memory, fully offline. Each test is a characterization test pinning the *current* behavior against real DOM — the features already ship; no `src/` changes. Most tests reuse the existing `test/e2e/fixtures/{base,added-task}.bpmn` pair via `bootBpmnDiffer`; two tasks add new fixture inputs (a Call Activity BPMN, the existing DMN pair). All boot through the shared `test/e2e/support/boot-differ.js` helper, extended once for DMN.

**Tech Stack:** Vanilla JS (ES6+), `@playwright/test` (real Chromium), the static server + harness from Phase 1. The `node:test` + jsdom unit suite is untouched.

**Spec:** `docs/superpowers/specs/2026-06-25-e2e-testing-design.md` (Layer 2, spec Phase 2). Realizes the "Deferred to later plans" list of `docs/superpowers/plans/2026-06-26-e2e-testing-phase1b.md`.

## Global Constraints

- Vanilla JS (ES6+); **no build step** for the extension. Playwright is a dev-only test runner.
- No new runtime dependencies; no new dev dependencies (Playwright already added in Phase 1).
- `npm test` stays **unit-only** (`node --test 'test/**/*.test.js'`) and unchanged. E2E is `npm run test:e2e`.
- E2E files are named `*.spec.js` (never `*.test.js`) so the unit glob ignores them.
- Phase adds **no `src/` files** and modifies **no `src/` files** — structural tests (`test/structure/*`) stay unaffected. The only non-test change is one new fixture file (`test/e2e/fixtures/call-activity.bpmn`) and edits to `test/e2e/support/boot-differ.js`.
- master is protected: work on a feature branch; per-task commits are minimalist (`test(e2e): …`), **without** `Co-Authored-By` and without tool/author mentions (matching the Phase 1/1b series — the whole phase is squashed into one feature commit at push time).
- `utils.js` declares top-level `const fileCache`, so it must load **exactly once** per page — the boot helper neutralizes the production `loadScripts` re-include of `utils.js` with an empty `data:` script (carried over from Phase 1; do not change). `bootDmnDiffer` reuses the identical sequence.

### Verified DOM facts (confirmed against source — used by the assertions below)

- **Canvas cell ids:** BPMN `#bpmnCanvas_12345bf3d4e842caa0d88194431197c0` (`bpmn-differ-view.js:5`), DMN `#dmnCanvas_12345bf3d4e842caa0d88194431197c0` (`dmn-differ-view.js:5`). Props inner div `#bpmnProps_12345bf3d4e842caa0d88194431197c0` (`bpmn-differ-view.js:6,170`).
- **Canvas element nodes** carry `data-element-id` (NOT `id`): `svg .djs-element[data-element-id="Task_1"]` (proven in Phase 1b). bpmn-js renders the pan/zoom group as `<g class="viewport">` with a `transform="matrix(…)"`; zoom/fit change that attribute.
- **Zoom/fit buttons** are icon buttons (label in `title`): `title="Zoom in"` (glyph `+`), `title="Zoom out"` (glyph `−`), `title="Fit view"` (glyph `⤢`) — `bpmn-differ-view.js:374-385`. Locate with `page.getByTitle(...)`.
- **Hide/show properties** is a *text* button toggling `"Hide properties"` ⇄ `"Show properties"` (`bpmn-differ-view.js:263,446-462`). It sets `display:none` on the props `<td>` and on the splitter `<td class="differ-splitter">` (`bpmn-differ-view.js:259-264,153`). State persists to `localStorage['bpmnDiffer.propsHidden']` — Playwright gives each test a fresh context, so it starts shown.
- **Empty/absent states** (`differ-empty-state.js`): a `<div class="differ-empty-state">` holding `<div class="differ-empty-state-message">`, mounted inside the canvas cell, shown via `display:flex`. Absent in **both** versions → centered message `"File does not exist in either version"` (`bpmn-differ.js:189`, `dmn-differ.js:50`). **CORRECTION (verified during Task 3):** switching to a side that lacks the file differs by differ — the **BPMN** `#showAbsentSide` only calls `bpmnJS.clear()` (canvas emptied to 0 `.djs-element`) and disables Download; it shows **no** `.differ-empty-state` cover (`bpmn-differ.js:364-375`). Only the **DMN** `#showAbsentSide` shows a blank `.differ-empty-state` cover, because dmn-js has no `clear()` (`dmn-differ.js:164-169`). So the BPMN absent-side test asserts canvas-cleared + Download-disabled, not a cover. The `FakePlatformClient` returns empty content for an unknown ref, which the differ treats as "file absent" (`fake-platform-client.js:16-21`).
- **View-only invariants (JS-based):** editing is vetoed but select+copy works.
  - Canvas labels (BUG-0015): double-click is **not** vetoed → bpmn-js opens the contenteditable overlay `.djs-direct-editing-content`; a capture-phase `beforeinput` veto on the canvas container blocks value mutation (`bpmn-differ.js:13-17,170-173`). So the overlay opens and selects text but typing does not change it.
  - Properties-panel fields (BUG-0014): text inputs stay enabled (not `pointer-events:none`); a capture-phase `beforeinput` veto on the props container blocks typing/paste/delete while leaving Ctrl/Cmd+C and selection working (`bpmn-differ.js:148-160`). The Name field is `#bio-properties-panel-name`.
  - **NOTE — CSS-based invariants are out of scope here.** Hiding the context-pad and disabling toggles/selects use `src/differ/styles.css` (`.djs-context-pad{display:none}`, `pointer-events:none`), and the harness loads only JS via `loadScripts` — it does **not** load `styles.css`. So context-pad/toggle assertions cannot pass in this harness; they are deferred until a "load the differ stylesheet into the harness" step is added. Phase 2 asserts only the JS `beforeinput` vetoes.
- **Call Activity dive-in** (`call-activity-navigator.js`): selecting a `bpmn:CallActivity` (with a `calledElement`) adds a bpmn-js overlay `<div class="djs-overlay djs-overlay-note" …>` whose html is `<div class="dive-in-call-activity">`; the badge gets `title="Open the called diagram"` and inner html `&#x2935;` (⤵) at rest (`call-activity-navigator.js:16-17,58-95`). Clicking the badge resolves the called file (search → fallback `window.open`) — **not** exercised here (needs tab/`window.open` handling); Phase 2 asserts only that the badge appears on selection.
- **DMN differ** (`dmn-differ.js`): constructor is already `(rawParams, platformClient)` (REFAC-0004 DI, line 27) — identical shape to `BpmnDiffer`. It needs no `camundaBpmnModdle`. `DmnJS` renders the decision **table** from the semantic XML (no DI section required — `test/fixtures/base.dmn` is semantic-only and renders); `#switchToViewTableMode()` clicks `.dmn-icon-decision-table` to show the table (`dmn-differ.js:40-42,199-223,324-336`). The existing `test/fixtures/{base,added-rule}.dmn` pair is the DMN scenario.
- **Do not assert computed colors** (carried over from Phase 1b): assert marker classes / text / attributes the CSS binds to, never `toHaveCSS('fill'/'color', …)`.

---

### Task 1: Zoom in / out / fit feature test

Assert the three view-group buttons change the bpmn-js viewport transform.

**Files:**
- Create: `test/e2e/differ-zoom.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics` (from `./support/boot-differ`, Phase 1b).

- [ ] **Step 1: Confirm the baseline e2e suite is green**

Run: `npm run test:e2e`
Expected: PASS — `infra` + `differ-boot` + the five Phase-1b feature specs (7 tests). This is the safety net before adding tests.

- [ ] **Step 2: Write `test/e2e/differ-zoom.spec.js`**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// bpmn-js renders the pan/zoom group as <g class="viewport"> inside the canvas
// SVG and applies the zoom as a transform matrix on it. Zoom in/out and fit all
// rewrite that attribute — robust and free of brittle pixel/size checks.
test('zooms in/out and fits the diagram', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const viewport = page.locator(
        '#bpmnCanvas_12345bf3d4e842caa0d88194431197c0 svg .viewport');
    await expect(viewport).toBeAttached();
    await expect(viewport).toHaveAttribute('transform', /matrix/);

    const initial = await viewport.getAttribute('transform');

    await page.getByTitle('Zoom in').click();
    await expect.poll(() => viewport.getAttribute('transform')).not.toBe(initial);
    const zoomedIn = await viewport.getAttribute('transform');

    await page.getByTitle('Zoom out').click();
    await expect.poll(() => viewport.getAttribute('transform')).not.toBe(zoomedIn);

    // Fit re-frames the diagram to the viewport (transform stays a matrix).
    await page.getByTitle('Fit view').click();
    await expect(viewport).toHaveAttribute('transform', /matrix/);
});
```

- [ ] **Step 3: Run only this spec**

Run: `npm run test:e2e -- differ-zoom.spec.js`
Expected: PASS.

- [ ] **Step 4: If it fails, inspect the artifacts (do not guess)**

Open `playwright-report/` / `npx playwright show-trace test-results/**/trace.zip`. Likely adjustment: the zoom group selector — bpmn-js uses `<g class="viewport">`; if the trace DOM shows a different wrapper, target the `<g>` directly under the canvas `<svg>` that carries the `transform` matrix. The button titles are verified (`bpmn-differ-view.js:374-385`). Fix to match real DOM, re-run Step 3.

- [ ] **Step 5: Commit**

```bash
git add test/e2e/differ-zoom.spec.js
git commit -m "test(e2e): cover BPMN differ zoom in/out/fit"
```

---

### Task 2: Hide/show properties panel feature test

Assert the toggle hides the props cell + splitter and flips its label, then restores both.

**Files:**
- Create: `test/e2e/differ-hide-properties.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`.

- [ ] **Step 1: Write `test/e2e/differ-hide-properties.spec.js`**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// "Hide properties" sets display:none on the props cell AND the splitter, and
// flips its own label to "Show properties" (persisted to localStorage, but each
// Playwright test gets a fresh context so it always starts shown).
test('hides and shows the properties panel', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const props = page.locator('#bpmnProps_12345bf3d4e842caa0d88194431197c0');
    const splitter = page.locator('.differ-splitter');

    await expect(props).toBeVisible();
    await expect(splitter).toBeVisible();

    await page.getByRole('button', { name: 'Hide properties' }).click();
    await expect(page.getByRole('button', { name: 'Show properties' })).toBeVisible();
    await expect(props).toBeHidden();
    await expect(splitter).toBeHidden();

    await page.getByRole('button', { name: 'Show properties' }).click();
    await expect(page.getByRole('button', { name: 'Hide properties' })).toBeVisible();
    await expect(props).toBeVisible();
    await expect(splitter).toBeVisible();
});
```

- [ ] **Step 2: Run only this spec**

Run: `npm run test:e2e -- differ-hide-properties.spec.js`
Expected: PASS.

- [ ] **Step 3: If it fails, inspect the artifacts (do not guess)**

`toBeHidden()` passes when an ancestor has `display:none` — the toggle sets it on the props `<td>` (`bpmn-differ-view.js:261`), and `#bpmnProps_…` is its child, so the inner div is hidden too. If the label text drifted, check `bpmn-differ-view.js:263,448`. Fix, re-run Step 2.

- [ ] **Step 4: Commit**

```bash
git add test/e2e/differ-hide-properties.spec.js
git commit -m "test(e2e): cover hide/show of the properties panel"
```

---

### Task 3: Empty / absent states feature test

Two states: file absent in both versions (centered message) and switching to a side without the file (blank cover, canvas cleared).

**Files:**
- Create: `test/e2e/differ-empty-state.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `ADDED_TASK_BPMN` (all exported by `./support/boot-differ` since Phase 1b).

- [ ] **Step 1: Write `test/e2e/differ-empty-state.spec.js`**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, ADDED_TASK_BPMN
} = require('./support/boot-differ');

const CANVAS = '#bpmnCanvas_12345bf3d4e842caa0d88194431197c0';

// Both refs point at content the fake does not have → loadFileContent returns ''
// for each side → the differ shows the centered "absent in both" placeholder.
test('shows a placeholder when the file is absent in both versions', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ sourceRef: 'gone', targetRef: 'gone' })
    });

    await expect(page.locator('.differ-empty-state')).toBeVisible();
    await expect(page.locator('.differ-empty-state-message'))
        .toHaveText('File does not exist in either version');
    await expect(page.locator(`${CANVAS} svg .djs-element`)).toHaveCount(0);
});

// Only the MR side has the file (added in this MR). show() renders the MR; then
// switching to the target/base side (absent there) clears the canvas and covers
// it with the blank empty-state (empty message).
test('covers the canvas when switching to a side without the file', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { fixtures: { xmlByRef: { 'mr-sha': ADDED_TASK_BPMN } } });

    await expect(page.locator(`${CANVAS} svg .djs-element`).first()).toBeVisible();

    await page.getByRole('button', { name: 'Switch branch' }).click();

    await expect(page.locator('.differ-empty-state')).toBeVisible();
    await expect(page.locator(`${CANVAS} svg .djs-element`)).toHaveCount(0);
});
```

- [ ] **Step 2: Run only this spec**

Run: `npm run test:e2e -- differ-empty-state.spec.js`
Expected: PASS (2 tests).

- [ ] **Step 3: If it fails, inspect the artifacts (do not guess)**

For the "both absent" test, confirm the message string against `bpmn-differ.js:189`. For the "switch to absent side" test, the path is `#showAbsentSide` → `bpmnJS.clear()` + `showEmptyState('')` (`bpmn-differ.js:347-355,364-375`); if `.djs-element` count is non-zero, the clear may be async — let the auto-retrying `toHaveCount(0)` settle (raise the expect timeout). Fix to match, re-run Step 2.

- [ ] **Step 4: Commit**

```bash
git add test/e2e/differ-empty-state.spec.js
git commit -m "test(e2e): cover empty and absent-side differ states"
```

---

### Task 4: View-only invariants feature test (BUG-0014 / BUG-0015)

Assert the two JS-based copy invariants: the canvas label overlay opens (for copy) but cannot be edited, and a properties-panel text field is enabled (selectable/copyable) but typing is vetoed.

**Files:**
- Create: `test/e2e/differ-view-only.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`.

- [ ] **Step 1: Write `test/e2e/differ-view-only.spec.js`**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// BUG-0015: double-click is NOT vetoed, so bpmn-js opens its contenteditable
// label overlay (the only way to select+copy SVG label text). A capture-phase
// beforeinput veto on the canvas container blocks edits, so the text the overlay
// shows stays put when the user types.
test('canvas label opens for copy but cannot be edited (BUG-0015)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    await page.locator('svg .djs-element[data-element-id="Task_1"]').dblclick();

    const editor = page.locator('.djs-direct-editing-content');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveText('Review request');

    // Typing is vetoed → the editable overlay's text does not change.
    await editor.click();
    await page.keyboard.type('XYZ');
    await expect(editor).toHaveText('Review request');
});

// BUG-0014: the panel's text fields stay enabled (BUG-0011's pointer-events:none
// would have killed click/select/copy); a capture-phase beforeinput veto on the
// props container blocks typing/paste/delete while leaving selection + Ctrl/Cmd+C
// working. We assert the Name field is enabled and that real keystrokes don't
// change its value.
test('properties-panel field is selectable but read-only (BUG-0014)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    await expect(page.locator('.bio-properties-panel-scroll-container')).toBeVisible();
    await page.locator('svg .djs-element[data-element-id="Task_1"]').click();

    const nameInput = page.locator('#bio-properties-panel-name');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toBeEnabled();
    await expect(nameInput).toHaveValue('Review request');

    // Real keystrokes fire beforeinput → vetoed → value unchanged.
    await nameInput.click();
    await page.keyboard.type('ZZZ');
    await expect(nameInput).toHaveValue('Review request');
});
```

- [ ] **Step 2: Run only this spec**

Run: `npm run test:e2e -- differ-view-only.spec.js`
Expected: PASS (2 tests).

- [ ] **Step 3: If it fails, inspect the artifacts (do not guess)**

These are the two interaction-heaviest tests of the phase — confirm live, do not guess.
- Canvas overlay didn't open → double-click the label region: `page.locator('svg .djs-element[data-element-id="Task_1"] .djs-label').dblclick()`, or dblclick the element's visual center. The overlay class is `.djs-direct-editing-content` (bpmn-js direct-editing). If `keyboard.type` doesn't reach it, `await editor.click()` first (already in the test) or `await editor.focus()`.
- Panel Name field id differs → open the trace DOM and read the actual id of the "Name" input under `.bio-properties-panel`; the bpmn-js id is `bio-properties-panel-name`. Do NOT use `fill()` — it sets the value directly and bypasses `beforeinput`; keep `keyboard.type` / `pressSequentially` so the veto is exercised.
Fix to match real behavior, re-run Step 2.

- [ ] **Step 4: Commit**

```bash
git add test/e2e/differ-view-only.spec.js
git commit -m "test(e2e): cover view-only copy invariants (BUG-0014/0015)"
```

---

### Task 5: Call Activity dive-in overlay feature test

Add a DI-bearing Call Activity fixture; assert selecting the call activity shows the dive-in badge.

**Files:**
- Create: `test/e2e/fixtures/call-activity.bpmn`
- Modify: `test/e2e/support/boot-differ.js` (read + export the new fixture)
- Create: `test/e2e/differ-dive-in.spec.js`

**Interfaces:**
- Produces (from `boot-differ.js`): `CALL_ACTIVITY_BPMN : string` — the new fixture XML.
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `CALL_ACTIVITY_BPMN`.

- [ ] **Step 1: Create `test/e2e/fixtures/call-activity.bpmn`**

A minimal diagrammed (DI-bearing) process whose only interesting element is a `bpmn:callActivity` with a `calledElement` — bpmn-js needs the DI to render, and the navigator keys the overlay off `calledElement`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_2" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_2" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:callActivity id="CallActivity_1" name="Run sub-process" calledElement="Sub_Process">
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

- [ ] **Step 2: Export the fixture from `test/e2e/support/boot-differ.js`**

Add the read next to the other fixture reads (after the `ADDED_TASK_BPMN` line, ~line 15):

```js
const CALL_ACTIVITY_BPMN = read('test/e2e/fixtures/call-activity.bpmn');
```

Add `CALL_ACTIVITY_BPMN` to the `module.exports` object (the `BASE_BPMN, ADDED_TASK_BPMN, BPMN_FIXTURES,` line becomes):

```js
    BASE_BPMN, ADDED_TASK_BPMN, CALL_ACTIVITY_BPMN, BPMN_FIXTURES,
```

- [ ] **Step 3: Write `test/e2e/differ-dive-in.spec.js`**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, CALL_ACTIVITY_BPMN
} = require('./support/boot-differ');

// Selecting a Call Activity (with a calledElement) adds a bpmn-js overlay holding
// the dive-in badge. We assert the badge appears with its "open" affordance; the
// actual dive-in (click → resolve/open) needs tab/window.open handling and is out
// of scope here. Same XML on both sides keeps the scenario about the overlay, not
// the diff.
test('shows the dive-in overlay on a selected Call Activity', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'base-sha': CALL_ACTIVITY_BPMN, 'mr-sha': CALL_ACTIVITY_BPMN } }
    });

    await page.locator('svg .djs-element[data-element-id="CallActivity_1"]').click();

    const badge = page.locator('.djs-overlay-note .dive-in-call-activity');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', 'Open the called diagram');
});
```

- [ ] **Step 4: Run only this spec**

Run: `npm run test:e2e -- differ-dive-in.spec.js`
Expected: PASS.

- [ ] **Step 5: If it fails, inspect the artifacts (do not guess)**

Likely points: the overlay class chain is `.djs-overlay.djs-overlay-note` containing `.dive-in-call-activity` (`call-activity-navigator.js:58-67`); if the badge is present but not "visible", it may render at the element's bottom-right corner off the fit viewport — assert `toBeAttached()` + the title instead, or click "Fit view" first. The selection must be a single element (`bpmn-differ.js:175-180`); clicking the call-activity shape selects it. Confirm `calledElement` survived import (the navigator returns early without it, `call-activity-navigator.js:53-56`). Fix to match, re-run Step 4.

- [ ] **Step 6: Commit**

```bash
git add test/e2e/fixtures/call-activity.bpmn test/e2e/support/boot-differ.js test/e2e/differ-dive-in.spec.js
git commit -m "test(e2e): cover the Call Activity dive-in overlay"
```

---

### Task 6: DMN boot/render smoke test

Add a `bootDmnDiffer` sibling helper and a DMN boot spec — the DMN analogue of the Phase-1 BPMN boot test.

**Files:**
- Modify: `test/e2e/support/boot-differ.js` (add DMN fixtures + `defaultDmnParams` + `bootDmnDiffer`)
- Create: `test/e2e/dmn-boot.spec.js`

**Interfaces:**
- Produces (from `boot-differ.js`):
  - `BASE_DMN`, `ADDED_RULE_DMN : string` — the DMN fixture pair (read from `test/fixtures/`, semantic-only; dmn-js renders the decision table without DI).
  - `DMN_FIXTURES : { xmlByRef: { 'base-sha': BASE_DMN, 'mr-sha': ADDED_RULE_DMN } }`.
  - `defaultDmnParams(overrides = {}) : object` — like `defaultBpmnParams` but `filePath`/`fileName` `decision.dmn` and **no** `camundaBpmnModdle`.
  - `bootDmnDiffer(page, { params?, fixtures? }) : Promise<void>` — identical boot sequence to `bootBpmnDiffer`, constructing `new DmnDiffer(params, client).show()`.
- Consumes: `wireDiagnostics`.

- [ ] **Step 1: Extend `test/e2e/support/boot-differ.js`**

Add the DMN fixture reads next to the BPMN ones (after `CALL_ACTIVITY_BPMN`, ~line 16). The DMN comparator fixtures in `test/fixtures/` are semantic-only and that is fine — dmn-js renders the decision **table** from semantics (no DI needed):

```js
const BASE_DMN = read('test/fixtures/base.dmn');
const ADDED_RULE_DMN = read('test/fixtures/added-rule.dmn');
const DMN_FIXTURES = { xmlByRef: { 'base-sha': BASE_DMN, 'mr-sha': ADDED_RULE_DMN } };
```

Add the DMN params factory next to `defaultBpmnParams` (DMN needs no camunda moddle):

```js
function defaultDmnParams(overrides = {}) {
    return {
        platform: { kind: 'fake', projectUrl: 'http://localhost/p', hostUrl: 'http://localhost', projectId: '1' },
        sourceRef: 'mr-sha',
        sourceLabel: 'feature',
        targetRef: 'base-sha',
        targetLabel: 'master',
        filePath: 'decision.dmn',
        fileName: 'decision.dmn',
        ...overrides
    };
}
```

Add the DMN boot helper next to `bootBpmnDiffer` (same load-once-utils sequence, just constructs `DmnDiffer`):

```js
async function bootDmnDiffer(page, { params = defaultDmnParams(), fixtures = DMN_FIXTURES } = {}) {
    await page.goto('/test/e2e/harness/differ-harness.html');

    // Load utils.js ONCE (see bootBpmnDiffer for why the re-include is neutralized).
    await page.addScriptTag({ url: '/src/core/utils.js' });
    await page.evaluate(async () => {
        const getLocalUrl = (name) =>
            name === 'src/core/utils.js' ? 'data:application/javascript,' : '/' + name;
        await loadScripts(document, getLocalUrl);
    });

    await page.addScriptTag({ url: '/test/e2e/support/fake-platform-client.js' });
    await page.evaluate(async ({ params, fixtures }) => {
        const client = new FakePlatformClient(fixtures);
        await new DmnDiffer(params, client).show();
    }, { params, fixtures });
}
```

Extend `module.exports` to include the new symbols:

```js
module.exports = {
    ROOT, read, camundaModdle,
    BASE_BPMN, ADDED_TASK_BPMN, CALL_ACTIVITY_BPMN, BPMN_FIXTURES,
    BASE_DMN, ADDED_RULE_DMN, DMN_FIXTURES,
    defaultBpmnParams, defaultDmnParams,
    wireDiagnostics, bootBpmnDiffer, bootDmnDiffer
};
```

- [ ] **Step 2: Confirm the BPMN specs still pass (boot helper changed)**

Run: `npm run test:e2e -- differ-boot.spec.js`
Expected: PASS — the helper change is additive; the BPMN boot path is unchanged.

- [ ] **Step 3: Write `test/e2e/dmn-boot.spec.js`**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootDmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// DMN analogue of the BPMN boot smoke: the real DmnDiffer renders the decision
// table from the semantic fixture (no DI needed) with the FakePlatformClient.
test('boots the DMN differ and renders the decision table', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page);

    await expect(page.locator('.differ-toolbar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch branch' })).toBeVisible();

    const canvas = page.locator('#dmnCanvas_12345bf3d4e842caa0d88194431197c0');
    await expect(canvas).toBeVisible();
    // dmn-js renders the decision table into the canvas cell.
    await expect(canvas.locator('table')).toBeVisible();
    await expect(canvas).toContainText('Discount');
});
```

- [ ] **Step 4: Run only this spec**

Run: `npm run test:e2e -- dmn-boot.spec.js`
Expected: PASS.

- [ ] **Step 5: If it fails, inspect the artifacts (do not guess)**

This is the riskiest test of the phase (first DMN render in the harness) — confirm live.
- No table rendered → check `[console.error]`/`[pageerror]` for a dmn-js import error. The differ switches to table view by clicking `.dmn-icon-decision-table` (`dmn-differ.js:324-336`); if the viewer opened the DRD view instead, target the rendered table by the dmn-js decision-table container class shown in the trace DOM rather than a bare `table`.
- "Discount" not found → it is the decision/output name in `test/fixtures/base.dmn`; read the trace DOM for the actual rendered header text and assert that (e.g. "Amount" input label) instead.
- If `DmnDiffer` is undefined → confirm `loadScripts` includes the DMN scripts (it does in production order); the harness reuses the real `loadScripts`, so a missing class means a load-order issue to report, not to patch here.
Fix to match real behavior, re-run Step 4.

- [ ] **Step 6: Commit**

```bash
git add test/e2e/support/boot-differ.js test/e2e/dmn-boot.spec.js
git commit -m "test(e2e): add DMN differ boot/render smoke test"
```

---

### Task 7: Full run + docs

Run the whole suite and record the expanded coverage.

**Files:**
- Modify: `docs/testing.md`

- [ ] **Step 1: Run the full e2e suite**

Run: `npm run test:e2e`
Expected: PASS — Phase 1/1b (7) + zoom (1) + hide-properties (1) + empty-state (2) + view-only (2) + dive-in (1) + dmn-boot (1) = **15 tests**. Note the actual count.

- [ ] **Step 2: Run the unit suite**

Run: `npm test`
Expected: PASS, unchanged count, no `*.spec.js` picked up.

- [ ] **Step 3: Update the e2e section of `docs/testing.md`**

Replace the current scope paragraph (the "Scope so far (Phase 1 + 1b): …" sentence, `docs/testing.md:39`) with:

> Scope so far (Phase 1 + 1b + 2): the harness, a BPMN boot/render smoke test, and Layer-2 feature tests for diff highlight, switch branch, the changes table + row click, the sequenceFlow condition in the properties panel, Ctrl/Cmd+F search, zoom in/out/fit, hide/show properties, empty/absent states, the view-only copy invariants (BUG-0014/0015, JS `beforeinput` vetoes), and the Call Activity dive-in overlay — plus a DMN boot/render smoke test. All BPMN specs boot via the shared `test/e2e/support/boot-differ.js` helper (DMN via its `bootDmnDiffer` sibling), reusing the `test/e2e/fixtures/` BPMN pair, the `test/fixtures/` DMN pair, and a `test/e2e/fixtures/call-activity.bpmn` fixture. **Not yet covered:** CSS-based view-only invariants (hidden context-pad, disabled toggles/selects — the harness loads only JS, not `styles.css`), the dive-in click→navigate flow, and full Layer-3 e2e (loaded extension + synthetic platform pages) — see the spec under `docs/superpowers/specs/`.

Also extend the `support/boot-differ.js` bullet (`docs/testing.md:35`) — append after its last sentence:

> It also exports `bootDmnDiffer(page, {params, fixtures})` / `defaultDmnParams(overrides)` / `DMN_FIXTURES` for the DMN boot test, and the `CALL_ACTIVITY_BPMN` fixture for the dive-in test.

- [ ] **Step 4: Commit**

```bash
git add docs/testing.md
git commit -m "docs(testing): record Phase 2 Layer-2 feature tests"
```

---

## Deferred to later plans (not Phase 2)

- **CSS-based view-only invariants** (hidden `.djs-context-pad`, `pointer-events:none` toggles/selects/FEEL editors): need the differ's `styles.css` loaded into the harness. A small harness step (inject `styles.css` via `loadScripts`/a `<link>`) unlocks these and any future style/geometry assertions — its own future task.
- **Dive-in click → navigate**: clicking the badge resolves the called file and opens a new tab (or `window.open` fallback). Needs `context.waitForEvent('page')` / a `window.open` stub — defer with the cross-tab navigation tests.
- **DMN feature tests** (decision-table diff highlight, switch branch, absent states): the DMN analogues of the BPMN Phase-1b set, on the new `bootDmnDiffer` helper.
- **Layer 3** — full e2e with the loaded extension + synthetic GitLab-shaped pages (spec Phase 3; carries the MV3-under-headless risk to validate first).

## Self-Review

**Spec coverage (spec Phase 2 list + Phase-1b "Deferred"):**
- Zoom/fit → Task 1. ✓
- Hide properties → Task 2. ✓
- Empty/absent states → Task 3. ✓
- View-only copy invariants (BUG-0011→0015) → Task 4 covers the JS `beforeinput` core (BUG-0014/0015); CSS-based parts (BUG-0011 context-pad/toggles) explicitly deferred with the reason (harness loads no CSS). ✓
- Dive-in overlays → Task 5 (overlay presence; click-navigate deferred). ✓
- DMN boot test → Task 6. ✓
- Full run + docs → Task 7. ✓

**Placeholder scan:** No TBD/TODO; every test step shows the full spec file; every assertion uses a source-verified selector or carries a Step-N "inspect the artifacts" fallback for the live-verify cases.

**Type consistency:** `bootBpmnDiffer`/`bootDmnDiffer`/`defaultBpmnParams`/`defaultDmnParams`/`wireDiagnostics`/`CALL_ACTIVITY_BPMN`/`ADDED_TASK_BPMN`/`BPMN_FIXTURES`/`DMN_FIXTURES` are defined/exported in Tasks 1/5/6 and consumed with those exact names. Canvas ids (`#bpmnCanvas_…`, `#dmnCanvas_…`), props id, classes (`differ-empty-state(-message)`, `differ-splitter`, `dive-in-call-activity`, `djs-overlay-note`, `djs-direct-editing-content`, `viewport`), input id (`bio-properties-panel-name`), button titles/labels match the Verified-DOM-facts block (each cites file:line).

**Risk note:** Task 4 (canvas overlay + panel field interaction) and Task 6 (first DMN render) are the live-verify-first cases; each carries an explicit Step fallback. Task 1's `.viewport` selector and Task 6's table selector are the two most likely to need a one-line adjustment against the trace DOM.
