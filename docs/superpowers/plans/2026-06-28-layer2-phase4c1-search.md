# Layer-2 Phase 4c1: Search depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the BPMN differ's Layer-2 e2e coverage of the floating search panel (FEAT-0006 / BUG-0007) beyond the single shipped "basic match + non-empty counter" case (`differ-search.spec.js`): next/previous navigation (Enter / Shift+Enter / ◀ ▶), the `search-match-current` marker, the `i/total` counter format, viewport centering on navigation, wrap at the edges, Esc / ✕ close + marker removal, the no-match counter, parameter-scope search (a condition expression — BUG-0007/FEAT-0006), and index rebuild on Switch branch.

**Architecture:** Each task adds one `test/e2e/differ-search-*.spec.js` that boots the real `BpmnDiffer` in Chromium via the existing `bootBpmnDiffer` helper with an in-memory `FakePlatformClient`. The search panel is a body-level DOM element opened with **Ctrl/Cmd+F** (`SearchPanel` keys on `event.code === 'KeyF'`, layout-independent — that is BUG-0007). It marks every hit with the `search-match` CSS class via `canvas.addMarker`, and the navigated ("current") hit additionally with `search-match-current`; both are class markers on the `.djs-element` SVG group, robustly assertable with `toHaveClass`. The counter element (`.search-panel-counter`) holds plain text whose format is fully specified by `SearchPanel.#updateCounter`. Centering is done by `canvas.viewbox(...)`, which rewrites the `<g class="viewport">` transform matrix — asserted exactly as the shipped `differ-zoom.spec.js` does (read the `transform` attribute, assert it changes). Three tasks reuse the default `base.bpmn`/`added-task.bpmn` scenario; the navigation/centering tasks need one new multi-match DI-bearing fixture.

**Tech Stack:** Vanilla JS (ES6+), `@playwright/test` (dev-only runner), `node:test` (unit, unaffected), the existing Layer-2 harness (`test/e2e/harness/differ-harness.html` — loads `src/differ/styles.css`; `test/e2e/support/boot-differ.js`, `fake-platform-client.js`, `static-server.js`).

## Global Constraints

- Vanilla JS (ES6+), no build step, **no new runtime dependencies**; `@playwright/test` is the already-agreed dev dependency. (CLAUDE.md)
- E2E files are named `*.spec.js` — **never** `*.test.js` (the `node:test` glob `test/**/*.test.js` must keep ignoring them; the Playwright `testMatch` is `**/*.spec.js`). (docs/testing.md, playwright.config.js)
- `npm test` (unit) stays unit-only and fast; e2e is the separate `npm run test:e2e` (= `playwright test`). (docs/testing.md)
- All code comments and docs are in **English only**. (CLAUDE.md)
- **master is protected** — do all work on a feature branch (`feature/e2e-phase4c1`); completing the work = push the branch + open an MR (skill `mr`, with `--remove-source-branch`) after green tests, without separate permission. Merge is the human's. (CLAUDE.md, docs/git-workflow.md)
- This plan adds **tests + one fixture only** — **no production `src/` changes**, so neither the DMN side nor the shared differ-page classes are touched.
- These are **characterization / integration tests of shipped behaviour**: a test is expected to PASS once written (and once its fixture exists). If a freshly written assertion of existing behaviour goes RED, do **not** loosen it and do **not** touch `src/` — a red means a real `bpmn-js` selector drift or a bug; investigate with superpowers:systematic-debugging (inspect the `[pageerror]` / `[console.error]` lines and the retained trace). The ONE allowed exception: if a red exposes a genuine bug, that is the user's call — surface the finding with options and, only if confirmed, file a BUG issue per `docs/issues/README.md`, make the minimal `src/` fix, and pin it (as BUG-0025 was handled in 4b).

**⚠️ FIXTURE NAME-COLLISION CHECK (the hard lesson from Phase 4a).** Before creating the new fixture, run `ls test/fixtures/ test/e2e/fixtures/` and confirm `search-multi.bpmn` is free (it is, as of this writing — neither directory has any `search-*` file). In 4a a "new" fixture name collided with an existing unit-test golden and was clobbered; the distinct `search-multi` basename avoids that.

---

## Reference — verified facts (from `src/differ/bpmn/search-panel.js`, `element-searcher.js`, `bpmn-differ.js`)

- **Open / close:** `SearchPanel` installs a capture-phase `keydown` hook; `(ctrlKey || metaKey) && code === 'KeyF'` → `open()` (and `preventDefault`s Chrome's native find — BUG-0007). `Escape` while open → `close()`. The panel DOM is `.search-panel` (a `<div>` appended to `document.body`), shown via `display:flex`, hidden via `display:none`.
- **Panel DOM:** input `.search-panel-input` (placeholder `Search element or parameter`), counter `.search-panel-counter`, and three `.search-panel-button` buttons in order: `◀` title `Previous (Shift+Enter)`, `▶` title `Next (Enter)`, `✕` title `Close (Esc)`.
- **Markers:** `SearchPanel.MATCH_MARKER === 'search-match'` (all hits), `SearchPanel.CURRENT_MARKER === 'search-match-current'` (the navigated hit only). Added via `canvas.addMarker` → CSS class on the `.djs-element` group (shapes AND connections — a connection's gfx carries `djs-element djs-connection`).
- **Live search (every keystroke):** `#runSearch` clears markers, recomputes `#matchIds`, sets `#currentIndex = -1`, marks every hit with `search-match`, updates the counter. It deliberately does NOT center or set a current match (the viewport stays still while typing).
- **Navigation (`#goTo`, via Enter / Shift+Enter / ◀ ▶):** Enter → `#goTo(1)`, Shift+Enter → `#goTo(-1)`; ◀ → `#goTo(-1)`, ▶ → `#goTo(1)`. From `currentIndex === -1` the first forward step lands on index 0, the first backward step on the last index. Otherwise it removes `search-match-current` from the old current, advances modulo `count` (so it **wraps**), adds `search-match-current` to the new current, **centers** the viewport on it (`canvas.viewbox`) and **selects** it (`selection.select`, driving the properties panel — so a found element shows selected). Exactly one element carries `search-match-current` after any navigation.
- **Counter text (`#updateCounter`):** empty input → `''`; matches `=== 0` → `'0'`; matches found but `currentIndex === -1` (typed, not yet navigated) → `String(count)` (the bare total); after navigation → `` `${currentIndex + 1}/${count}` `` (e.g. `2/3`).
- **Centering (`#centerOnElement`):** always recenters via `canvas.viewbox({x: mid.x - w/2, y: mid.y - h/2, ...})` (keeps zoom). This rewrites the `<g class="viewport">` transform matrix — the same attribute `differ-zoom.spec.js` reads. Different matches at different positions → different transform.
- **Parameter scope (FEAT-0006, `ElementSearcher`):** the index covers each element's name, id AND parameter values reachable from its business object — including a sequenceFlow's `conditionExpression` text. So in `base.bpmn`, searching `approved` matches `Flow_2` (condition `${approved == true}`), which name/id-only search would miss. Document order is preserved in the index (and so in `#matchIds`).
- **Rebuild on Switch (`SearchPanel.rebuildIndex`, called from `BpmnDiffer#showXml` after every import):** drops the stale match ids, sets `currentIndex = -1`, rebuilds the index from the freshly imported registry, and — **if the panel is open** — re-runs the search with the current input. The panel itself is NOT recreated on switch (it lives on `document.body`), so its input text persists.

## File Structure

New fixture (under `test/e2e/fixtures/` — basename verified free of collisions):
- `search-multi.bpmn` — Tasks 1 & 2: a linear diagram with three spaced userTasks all named `Check …` (so `Check` matches exactly 3 elements, at distinct positions for the centering assertion).

New spec files (all under `test/e2e/`):
- `differ-search-navigation.spec.js` — Task 1 (counter `i/total`, Enter/Shift+Enter/◀▶, `search-match-current` moves, wrap, selection follows)
- `differ-search-centering.spec.js` — Task 2 (viewport transform recenters on Enter)
- `differ-search-close.spec.js` — Task 3 (Esc closes + removes markers; ✕ closes + removes markers)
- `differ-search-scope-rebuild.spec.js` — Task 4 (no-match `0`; parameter-scope match on `Flow_2`; index rebuild on Switch → `0`)

Modified:
- `test/e2e/support/boot-differ.js` — Task 1 adds + exports `SEARCH_MULTI_BPMN` (Task 2 reuses it; Tasks 3, 4 reuse existing exports and do NOT touch it).

**Out of scope for 4c1 (deferred):** all of Section F (toolbar / header / modes / geometry) → Phase 4c2. Asserting that the *built-in* Chrome find bar is suppressed (can't be observed from inside the page) — the `preventDefault` is covered indirectly by the panel opening on Ctrl/Cmd+F (already in `differ-search.spec.js`).

---

### Task 1: Search navigation — counter `i/total`, Enter/Shift+Enter/◀▶, current marker, wrap (+ `search-multi.bpmn` fixture)

**Files:**
- Create: `test/e2e/fixtures/search-multi.bpmn` (DI-bearing; basename is free — verify with `ls test/e2e/fixtures/`)
- Modify: `test/e2e/support/boot-differ.js` (add + export `SEARCH_MULTI_BPMN`)
- Create: `test/e2e/differ-search-navigation.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics` from `./support/boot-differ`, and the **new** `SEARCH_MULTI_BPMN`.
- Produces: `SEARCH_MULTI_BPMN` — contents of `test/e2e/fixtures/search-multi.bpmn`, exported from `boot-differ.js` (consumed by this task and Task 2).

- [ ] **Step 1: Create the fixture `test/e2e/fixtures/search-multi.bpmn`** (linear Start → Task_A "Check alpha" → Task_B "Check beta" → Task_C "Check gamma" → End; the three tasks are spaced 160px apart so each is at a distinct viewport center)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task_A" name="Check alpha">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="Task_B" name="Check beta">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="Task_C" name="Check gamma">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>Flow_4</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_A" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_A" targetRef="Task_B" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_B" targetRef="Task_C" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Task_C" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="82" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A">
        <dc:Bounds x="240" y="60" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B">
        <dc:Bounds x="400" y="60" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_C_di" bpmnElement="Task_C">
        <dc:Bounds x="560" y="60" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="720" y="82" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="100" />
        <di:waypoint x="240" y="100" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="340" y="100" />
        <di:waypoint x="400" y="100" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="500" y="100" />
        <di:waypoint x="560" y="100" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4">
        <di:waypoint x="660" y="100" />
        <di:waypoint x="720" y="100" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```

- [ ] **Step 2: Add and export the constant in `test/e2e/support/boot-differ.js`**

Add after the `CALL_ACTIVITY_IN_CHANGED_BPMN` line (currently line 22):

```js
const CALL_ACTIVITY_IN_CHANGED_BPMN = read('test/e2e/fixtures/call-activity-in-changed.bpmn');
const SEARCH_MULTI_BPMN = read('test/e2e/fixtures/search-multi.bpmn');
```

Extend the first BPMN line of `module.exports` (currently `BASE_BPMN, ADDED_TASK_BPMN, CALL_ACTIVITY_BPMN, CHANGED_TASK_NAME_BPMN,`) by appending `SEARCH_MULTI_BPMN` to the BPMN exports block — e.g. add it on the `CALL_ACTIVITY_IN_BASE_BPMN, CALL_ACTIVITY_IN_CHANGED_BPMN, BPMN_FIXTURES,` line:

```js
    CALL_ACTIVITY_IN_BASE_BPMN, CALL_ACTIVITY_IN_CHANGED_BPMN, SEARCH_MULTI_BPMN, BPMN_FIXTURES,
```

- [ ] **Step 3: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, SEARCH_MULTI_BPMN } = require('./support/boot-differ');

// search-multi.bpmn has three userTasks all named "Check ..." (document order
// Task_A, Task_B, Task_C). Ctrl/Cmd+F opens the panel; typing "Check" matches all
// three (live search marks them with `search-match`, counter shows the bare total
// "3", no current yet). Enter / Shift+Enter / the ◀ ▶ buttons drive #goTo: the
// counter becomes "i/total", exactly one element carries `search-match-current`,
// the index wraps at the edges, and the current match is selected on the canvas.
test('navigates matches with Enter/Shift+Enter and the ◀ ▶ buttons (counter, current marker, wrap)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { fixtures: { xmlByRef: { 'base-sha': SEARCH_MULTI_BPMN } } });

    await page.keyboard.press('Control+f');
    const input = page.locator('input.search-panel-input');
    await expect(input).toBeFocused();
    const counter = page.locator('.search-panel-counter');

    await input.fill('Check');

    // Live search: three hits marked, the bare total shown, navigation not started.
    await expect(page.locator('svg .search-match')).toHaveCount(3);
    await expect(page.locator('svg .search-match-current')).toHaveCount(0);
    await expect(counter).toHaveText('3');

    const matchCurrent = (id) => page.locator(`svg .djs-element[data-element-id="${id}"]`);

    // First Enter → first match (document order: Task_A), selected and current.
    await input.press('Enter');
    await expect(counter).toHaveText('1/3');
    await expect(page.locator('svg .search-match-current')).toHaveCount(1);
    await expect(matchCurrent('Task_A')).toHaveClass(/search-match-current/);
    await expect(matchCurrent('Task_A')).toHaveClass(/selected/);

    // Enter steps forward; the previous current loses the marker.
    await input.press('Enter');
    await expect(counter).toHaveText('2/3');
    await expect(matchCurrent('Task_B')).toHaveClass(/search-match-current/);
    await expect(matchCurrent('Task_A')).not.toHaveClass(/search-match-current/);

    await input.press('Enter');
    await expect(counter).toHaveText('3/3');
    await expect(matchCurrent('Task_C')).toHaveClass(/search-match-current/);

    // Wrap forward: 3/3 → 1/3.
    await input.press('Enter');
    await expect(counter).toHaveText('1/3');
    await expect(matchCurrent('Task_A')).toHaveClass(/search-match-current/);

    // Wrap backward: 1/3 → 3/3.
    await input.press('Shift+Enter');
    await expect(counter).toHaveText('3/3');
    await expect(matchCurrent('Task_C')).toHaveClass(/search-match-current/);

    // The ◀ ▶ buttons mirror Shift+Enter / Enter.
    await page.getByTitle('Previous (Shift+Enter)').click();
    await expect(counter).toHaveText('2/3');
    await expect(matchCurrent('Task_B')).toHaveClass(/search-match-current/);

    await page.getByTitle('Next (Enter)').click();
    await expect(counter).toHaveText('3/3');
    await expect(matchCurrent('Task_C')).toHaveClass(/search-match-current/);

    // Throughout, exactly one element is the current match.
    await expect(page.locator('svg .search-match-current')).toHaveCount(1);
});
```

- [ ] **Step 4: Run the test**

Run: `npx playwright test test/e2e/differ-search-navigation.spec.js`
Expected: PASS (characterizes shipped behaviour). A red is a real finding — investigate per systematic-debugging, do not loosen. (If the match *order* differs from document order, that is a real `ElementSearcher` finding — surface it, do not silently reorder the asserts.)

- [ ] **Step 5: Commit**

```bash
git add test/e2e/fixtures/search-multi.bpmn test/e2e/support/boot-differ.js test/e2e/differ-search-navigation.spec.js
git commit -m "test(e2e): cover search navigation, counter, current marker, wrap (Layer-2 4c1)"
```

---

### Task 2: Search centering — the viewport recenters on the navigated match

**Files:**
- Create: `test/e2e/differ-search-centering.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `SEARCH_MULTI_BPMN` from `./support/boot-differ` (the export added in Task 1 — Task 2 depends on Task 1 having landed it).
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, SEARCH_MULTI_BPMN } = require('./support/boot-differ');

const CANVAS = '#bpmnCanvas_12345bf3d4e842caa0d88194431197c0';

// The three "Check ..." tasks sit at different x positions. #goTo centers the
// viewport on the current match via canvas.viewbox(...), which rewrites the
// <g class="viewport"> transform matrix (the same attribute differ-zoom.spec.js
// reads). Stepping Enter from one match to the next must therefore change the
// transform. Centering on typing does NOT happen (the viewport stays still while
// the user types) — only explicit navigation recenters.
test('recenters the viewport on the current match when navigating', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { fixtures: { xmlByRef: { 'base-sha': SEARCH_MULTI_BPMN } } });

    const viewport = page.locator(`${CANVAS} svg .viewport`);
    // Ensure the transform matrix exists (it is set on the import-time fit, but
    // click Fit to be robust, exactly as differ-zoom.spec.js does).
    await page.getByTitle('Fit view').click();
    await expect(viewport).toHaveAttribute('transform', /matrix/);

    await page.keyboard.press('Control+f');
    const input = page.locator('input.search-panel-input');
    await input.fill('Check');

    // Typing alone does not move the viewport.
    const afterType = await viewport.getAttribute('transform');

    // First Enter → center on Task_A.
    await input.press('Enter');
    await expect.poll(() => viewport.getAttribute('transform')).not.toBe(afterType);
    const onFirst = await viewport.getAttribute('transform');

    // Next Enter → center on Task_B (a different position → a different matrix).
    await input.press('Enter');
    await expect.poll(() => viewport.getAttribute('transform')).not.toBe(onFirst);
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test test/e2e/differ-search-centering.spec.js`
Expected: PASS. A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-search-centering.spec.js
git commit -m "test(e2e): cover search viewport centering on navigation (Layer-2 4c1)"
```

---

### Task 3: Search close — Esc and ✕ hide the panel and remove all markers

**Files:**
- Create: `test/e2e/differ-search-close.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics` from `./support/boot-differ` (default `base.bpmn`/`added-task.bpmn` scenario — "Notify" is the serviceTask Task_2 added in the MR).
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the file with two tests**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// close() hides the .search-panel (display:none) and clears every match marker
// (search-match and search-match-current). Triggered by Escape...
test('Esc closes the panel and removes the match markers', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    await page.keyboard.press('Control+f');
    const panel = page.locator('.search-panel');
    await expect(panel).toBeVisible();

    const input = page.locator('input.search-panel-input');
    await input.fill('Notify');
    await input.press('Enter');
    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]'))
        .toHaveClass(/search-match-current/);

    await page.keyboard.press('Escape');

    await expect(panel).toBeHidden();
    await expect(page.locator('svg .search-match')).toHaveCount(0);
    await expect(page.locator('svg .search-match-current')).toHaveCount(0);
});

// ...and by the ✕ button.
test('the ✕ button closes the panel and removes the match markers', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    await page.keyboard.press('Control+f');
    const panel = page.locator('.search-panel');
    await expect(panel).toBeVisible();

    const input = page.locator('input.search-panel-input');
    await input.fill('Notify');
    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]'))
        .toHaveClass(/search-match/);

    await page.getByTitle('Close (Esc)').click();

    await expect(panel).toBeHidden();
    await expect(page.locator('svg .search-match')).toHaveCount(0);
});
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test test/e2e/differ-search-close.spec.js`
Expected: PASS (both). A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-search-close.spec.js
git commit -m "test(e2e): cover search close (Esc / ✕) + marker removal (Layer-2 4c1)"
```

---

### Task 4: Search no-match, parameter-scope (BUG-0007/FEAT-0006), and index rebuild on Switch

**Files:**
- Create: `test/e2e/differ-search-scope-rebuild.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics` from `./support/boot-differ` (default scenario: base + MR-adds-Task_2; `Flow_2`'s condition is `${approved == true}` in both).
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the file with three tests**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// No match: the counter shows "0" and nothing is marked.
test('shows the 0 counter and no markers when nothing matches', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    await page.keyboard.press('Control+f');
    const input = page.locator('input.search-panel-input');
    await input.fill('zzznomatch');

    await expect(page.locator('.search-panel-counter')).toHaveText('0');
    await expect(page.locator('svg .search-match')).toHaveCount(0);
});

// Parameter-scope (FEAT-0006/BUG-0007): ElementSearcher indexes parameter values,
// not just name/id. Flow_2 has no name but its conditionExpression is
// "${approved == true}", so searching "approved" matches the sequence flow —
// something the viewer's name/id-only search could never find.
test('matches a sequence flow by its condition expression (parameter scope)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    await page.keyboard.press('Control+f');
    const input = page.locator('input.search-panel-input');
    await input.fill('approved');

    await expect(page.locator('svg .djs-element[data-element-id="Flow_2"]'))
        .toHaveClass(/search-match/);
    await expect(page.locator('.search-panel-counter')).toHaveText('1');
});

// Index rebuild on Switch: "Notify" (Task_2) exists only in the MR side. With the
// panel open, switching to the base side runs #showXml → searchPanel.rebuildIndex,
// which re-indexes the freshly imported (base) diagram and re-runs the search with
// the kept input — now 0 matches, so the counter drops to "0".
test('rebuilds the search index on Switch branch (match disappears on the other side)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    await page.keyboard.press('Control+f');
    const input = page.locator('input.search-panel-input');
    await input.fill('Notify');
    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]'))
        .toHaveClass(/search-match/);
    await expect(page.locator('.search-panel-counter')).toHaveText('1');

    await page.getByRole('button', { name: 'Switch branch' }).click();

    // Task_2 is absent on the base side; the rebuilt index yields no hit.
    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]')).toHaveCount(0);
    await expect(page.locator('.search-panel-counter')).toHaveText('0');
    await expect(page.locator('svg .search-match')).toHaveCount(0);
});
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test test/e2e/differ-search-scope-rebuild.spec.js`
Expected: PASS (all three). A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-search-scope-rebuild.spec.js
git commit -m "test(e2e): cover search no-match, parameter scope, index rebuild on switch (Layer-2 4c1)"
```

---

## Finalize 4c1

- [ ] **Run the full suites green**

Run: `npm test` → unit suite unchanged & green.
Run: `npm run test:e2e` → all e2e specs green (33 prior + 7 new tests across 4 new files; no existing spec regressed — this plan adds tests + one fixture only).

- [ ] **Push + MR** (per CLAUDE.md / docs/git-workflow.md; branch `feature/e2e-phase4c1`)

Use the `mr` skill (push + open MR into master with `--remove-source-branch`). Merge is the human's. Do not push with a red suite.

- [ ] **Update the auto-memory** `layer2-e2e-coverage.md` with a "Phase 4c1 SHIPPED" entry: the 4 new search specs + `search-multi.bpmn`, full suite count, and any lessons.
