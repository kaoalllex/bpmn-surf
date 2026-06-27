# E2E Testing — Phase 1b (Layer-2 BPMN feature tests) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the now-green Layer-2 harness, add the five highest-value BPMN differ feature tests (diff highlight, switch branch, changes table + row click, sequenceFlow condition in the properties panel, Ctrl/Cmd+F search) — characterization tests that pin the *current* behavior against real DOM.

**Architecture:** Phase 1 proved the harness (boot the real `BpmnDiffer` in Chromium with an injected `FakePlatformClient`, all data in-memory). This phase first extracts the inline boot logic from `differ-boot.spec.js` into a shared `test/e2e/support/boot-differ.js` helper, then adds one `*.spec.js` per feature that boots via that helper and asserts the real markers/DOM. These are *not* TDD-of-new-code — the features already ship; each test is written, run against the live harness, and its assertions confirmed green (the spec's "verified live rather than guessed"). No `src/` changes. All five features reuse the existing `test/e2e/fixtures/{base,added-task}.bpmn` pair — no new fixtures.

**Tech Stack:** Vanilla JS (ES6+), `@playwright/test` (real Chromium), the static server + harness from Phase 1. The `node:test` + jsdom unit suite is untouched.

**Spec:** `docs/superpowers/specs/2026-06-25-e2e-testing-design.md` (Layer 2; this realizes the feature-test set the spec's Phase 1 named and the Phase-1 *plan* deferred).

## Global Constraints

- Vanilla JS (ES6+); **no build step** for the extension. Playwright is a dev-only test runner.
- No new runtime dependencies; no new dev dependencies (Playwright already added in Phase 1).
- `npm test` stays **unit-only** (`node --test 'test/**/*.test.js'`) and unchanged. E2E is `npm run test:e2e`.
- E2E files are named `*.spec.js` (never `*.test.js`) so the unit glob ignores them.
- Phase adds **no `src/` files** and modifies **no `src/` files** — structural tests (`test/structure/*`) stay unaffected.
- master is protected: work on a feature branch; commits minimalist, **without** `Co-Authored-By` and without tool/author mentions.
- `utils.js` declares top-level `const fileCache`, so it must load **exactly once** per page — the boot helper neutralizes the production `loadScripts` re-include of `utils.js` with an empty `data:` script (carried over from Phase 1, do not change).

### Verified DOM facts (used by the assertions below — confirmed against source)

- Canvas element nodes carry **`data-element-id`** (NOT `id`): selector `svg .djs-element[data-element-id="Task_2"]` (proven by `diff-highlighter.js:47`, which queries `[data-element-id="${shape.id}"]`).
- Diff markers are diagram-js CSS classes added to `g.djs-element`: `highlight-diff` (steady), `highlight-diff-pulse` (first 1.5 s after enabling), `highlight-diff-big` (changes-table selected row). Constants in `diff-highlighter.js:3-8`; `PULSE_DURATION_MS = 1500` (line 12).
- **Icon** toolbar buttons (`bpmn-differ-view.js#button`, line 304-322) set `textContent` to the glyph and put the label in **`title`** — so locate them with `page.getByTitle(...)`, not `getByRole('button',{name})`. Only **text** buttons ("Switch branch", "Show changes") match by accessible name.
- Highlight toggle: icon `☼`, `title="Turn diff highlight on"`; after click `title="Turn diff highlight off"`, glyph `☀` (`bpmn-differ-view.js:387-398`). Disabled unless a source version is defined — our params set `sourceRef`, so it is enabled.
- "Switch branch": text button, `strong`, enabled iff `isSourceVersionDefined()` (`bpmn-differ-view.js:364-369`). `show()` renders the **MR** side first (`bpmn-differ.js:200-201`); first "Switch branch" click runs `#showBranch()` → target side (`bpmn-differ.js:342-358`).
- Branch indicator: a `<span>` whose text is `"<role> · <label>"` and inline `color` flips — `"Changed · feature"` (source shown) vs `"Original · master"` (target shown) (`branch-indicator.js:50-59`; roles `Original`/`Changed`).
- Changes table: `<table class="table-fixed-header changes-table">`, body rows under `tbody`; container `<div>` starts `display:none`, revealed by the "Show changes" text button which then reads "Hide changes" (`bpmn-differ-view.js:506-547`). Row click sets row bg and adds `highlight-diff-big` to the element (`changes-table-view.js:198-213`). Columns: Change / Id / Name / Type / Properties.
- Search panel (`search-panel.js`): Ctrl/Cmd+F (handler keys on `event.code === 'KeyF'`, calls `preventDefault`) opens `.search-panel` (`display:flex`), input `input.search-panel-input`, counter `.search-panel-counter`; matched elements get the `search-match` class, current match `search-match-current`.
- Properties-panel condition (`properties-panel-highlighter.js:105-140`): selecting a `bpmn:SequenceFlow` with a `conditionExpression` injects `div.properties-condition` (id starts `bpmnPropsCondition_`) next to the native `#bio-properties-panel-conditionExpression`. Panel readiness signal: `.bio-properties-panel-scroll-container` present (`bpmn-differ.js:750-756`).
- **Do not assert computed colors** (`toHaveCSS('fill'/'color', …)`): Playwright normalizes to `rgb(...)` and the shape fill is set by bpmn-js `modeling.setColor` on inner paths, not the `g`. Assert the **marker classes / text** the CSS binds to instead — they are stable and meaningful.

---

### Task 1: Extract the shared boot helper

Pull the inline harness logic out of `differ-boot.spec.js` into a reusable module the feature specs import. Behavior-preserving: the boot spec must stay green.

**Files:**
- Create: `test/e2e/support/boot-differ.js`
- Modify: `test/e2e/differ-boot.spec.js`

**Interfaces:**
- Produces (consumed by Tasks 2-6):
  - `bootBpmnDiffer(page, { params?, fixtures? }) : Promise<void>` — navigates the harness, loads scripts once, constructs `new BpmnDiffer(params, new FakePlatformClient(fixtures)).show()`.
  - `defaultBpmnParams(overrides = {}) : object` — the canonical params (sourceRef `mr-sha`/label `feature`, targetRef `base-sha`/label `master`, `filePath`/`fileName` `diagram.bpmn`, `camundaBpmnModdle`, `platform.kind='fake'`).
  - `BPMN_FIXTURES : { xmlByRef: { 'base-sha': <base.bpmn>, 'mr-sha': <added-task.bpmn> } }` — the default base→added-task scenario.
  - `wireDiagnostics(page) : void` — mirrors page `console.error`/`pageerror` into the test stdout.

- [ ] **Step 1: Confirm the baseline e2e suite is green**

Run: `npm run test:e2e`
Expected: PASS — both `infra.spec.js` and `differ-boot.spec.js` pass. This is the refactor's safety net.

- [ ] **Step 2: Create `test/e2e/support/boot-differ.js`**

```js
'use strict';

// Shared Layer-2 harness helper: boots the real BPMN differ in the page with an
// injected FakePlatformClient. The feature specs (differ-*.spec.js) import this
// so the boot sequence lives in one place and stays in sync with production.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

// Diagrammed (DI-bearing) fixtures — bpmn-js needs layout to render; the
// semantic test/fixtures/ pair omits it. See test/e2e/fixtures/.
const BASE_BPMN = read('test/e2e/fixtures/base.bpmn');
const ADDED_TASK_BPMN = read('test/e2e/fixtures/added-task.bpmn');
const camundaModdle = require(path.join(ROOT, 'libs/camunda-bpmn-moddle/resources/camunda.json'));

// Default scenario: the MR (mr-sha) adds Task_2 'Notify' serviceTask + Flow_3
// over base (base-sha). show() renders the MR side first.
const BPMN_FIXTURES = { xmlByRef: { 'base-sha': BASE_BPMN, 'mr-sha': ADDED_TASK_BPMN } };

function defaultBpmnParams(overrides = {}) {
    return {
        platform: { kind: 'fake', projectUrl: 'http://localhost/p', hostUrl: 'http://localhost', projectId: '1' },
        sourceRef: 'mr-sha',
        sourceLabel: 'feature',
        targetRef: 'base-sha',
        targetLabel: 'master',
        filePath: 'diagram.bpmn',
        fileName: 'diagram.bpmn',
        camundaBpmnModdle: camundaModdle,
        ...overrides
    };
}

// Surface page errors and console.error in the test log (the trace also captures
// them on failure — see playwright.config.js). Call once at the top of a test.
function wireDiagnostics(page) {
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));
    page.on('console', (msg) => {
        if (msg.type() === 'error') console.log('[console.error]', msg.text());
    });
}

async function bootBpmnDiffer(page, { params = defaultBpmnParams(), fixtures = BPMN_FIXTURES } = {}) {
    await page.goto('/test/e2e/harness/differ-harness.html');

    // Load utils.js ONCE (defines loadScripts / loadFileContent). The real
    // loadScripts below re-includes utils.js, but a second load would throw
    // ("const fileCache already declared"), so neutralize that one re-load with
    // an empty data: script. Every other differ script loads fresh.
    await page.addScriptTag({ url: '/src/core/utils.js' });
    await page.evaluate(async () => {
        const getLocalUrl = (name) =>
            name === 'src/core/utils.js' ? 'data:application/javascript,' : '/' + name;
        await loadScripts(document, getLocalUrl);
    });

    await page.addScriptTag({ url: '/test/e2e/support/fake-platform-client.js' });
    await page.evaluate(async ({ params, fixtures }) => {
        const client = new FakePlatformClient(fixtures);
        await new BpmnDiffer(params, client).show();
    }, { params, fixtures });
}

module.exports = {
    ROOT, read, camundaModdle,
    BASE_BPMN, ADDED_TASK_BPMN, BPMN_FIXTURES,
    defaultBpmnParams, wireDiagnostics, bootBpmnDiffer
};
```

- [ ] **Step 3: Rewrite `test/e2e/differ-boot.spec.js` to use the helper**

Replace the entire file with:

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

test('boots the BPMN differ and renders the diagram', async ({ page }) => {
    wireDiagnostics(page);

    await bootBpmnDiffer(page);

    // Toolbar with the primary action rendered.
    await expect(page.locator('.differ-toolbar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch branch' })).toBeVisible();

    // bpmn-js actually rendered the diagram into the canvas cell.
    const canvas = page.locator('#bpmnCanvas_12345bf3d4e842caa0d88194431197c0');
    await expect(canvas).toBeVisible();
    await expect(canvas.locator('svg .djs-element').first()).toBeVisible();
});
```

- [ ] **Step 4: Run the e2e suite**

Run: `npm run test:e2e`
Expected: PASS — same two tests, boot spec now driven by the shared helper.

- [ ] **Step 5: Confirm the unit suite is unaffected**

Run: `npm test`
Expected: PASS (1060+), no `*.spec.js` picked up.

- [ ] **Step 6: Commit**

```bash
git add test/e2e/support/boot-differ.js test/e2e/differ-boot.spec.js
git commit -m "test(e2e): extract shared BPMN differ boot helper"
```

---

### Task 2: Diff-highlight feature test

Assert the highlight toggle: off by default (no marker), and after clicking it the added elements (`Task_2`, `Flow_3`) get the diff-highlight marker.

**Files:**
- Create: `test/e2e/differ-highlight.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics` (Task 1).

- [ ] **Step 1: Write the test `test/e2e/differ-highlight.spec.js`**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// The MR (default side) adds Task_2 + Flow_3 over base. The diff highlight
// outline is OFF by default; clicking the ☼ button turns it on (a 1.5 s pulse
// phase, then steady). We assert the marker class appears — robust against the
// pulse→steady swap and free of brittle computed-color checks.
test('toggles the diff highlight on the added elements', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const addedTask = page.locator('svg .djs-element[data-element-id="Task_2"]');
    await expect(addedTask).toBeVisible();

    // Off by default: no highlight marker yet.
    await expect(addedTask).not.toHaveClass(/highlight-diff/);

    // Turn the diff highlight on (icon button — located by its title).
    await page.getByTitle('Turn diff highlight on').click();

    // The button flipped to the "off" affordance.
    await expect(page.getByTitle('Turn diff highlight off')).toBeVisible();

    // The added elements now carry a highlight marker (pulse or steady).
    await expect(addedTask).toHaveClass(/highlight-diff/);
    await expect(page.locator('svg .djs-element[data-element-id="Flow_3"]'))
        .toHaveClass(/highlight-diff/);

    // After the pulse settles it becomes the steady marker.
    await expect(addedTask).toHaveClass(/(^|\s)highlight-diff(\s|$)/, { timeout: 3000 });
});
```

- [ ] **Step 2: Run only this spec**

Run: `npm run test:e2e -- differ-highlight.spec.js`
Expected: PASS.

- [ ] **Step 3: If it fails, inspect the artifacts (do not guess)**

Open `playwright-report/` or run `npx playwright show-trace test-results/**/trace.zip`. Check the `[pageerror]`/`[console.error]` lines, the screenshot, and the failing locator's actual class list. Likely adjustments if a fact drifted: the exact title string (`bpmn-differ-view.js:389`), the marker constant (`diff-highlighter.js:3-8`), or the steady-marker regex. Fix the assertion to match the real DOM, then re-run Step 2.

- [ ] **Step 4: Commit**

```bash
git add test/e2e/differ-highlight.spec.js
git commit -m "test(e2e): cover the BPMN diff highlight toggle"
```

---

### Task 3: Switch-branch feature test

Assert that "Switch branch" flips the shown side: the added element disappears and the branch indicator text changes.

**Files:**
- Create: `test/e2e/differ-switch-branch.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics` (Task 1).

- [ ] **Step 1: Write the test `test/e2e/differ-switch-branch.spec.js`**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// show() renders the MR side first (Task_2 present, indicator "Changed ·
// feature"). Clicking "Switch branch" shows the target/base side, where Task_2
// does not exist and the indicator reads "Original · master".
test('switches between the MR and target versions', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const addedTask = page.locator('svg .djs-element[data-element-id="Task_2"]');
    const indicator = page.locator('.differ-toolbar span', { hasText: '·' });

    // MR side first: added element present, source label shown.
    await expect(addedTask).toBeVisible();
    await expect(indicator).toContainText('Changed · feature');

    await page.getByRole('button', { name: 'Switch branch' }).click();

    // Target/base side: the added element is gone, target label shown.
    await expect(addedTask).toHaveCount(0);
    await expect(indicator).toContainText('Original · master');

    // And back.
    await page.getByRole('button', { name: 'Switch branch' }).click();
    await expect(addedTask).toBeVisible();
    await expect(indicator).toContainText('Changed · feature');
});
```

- [ ] **Step 2: Run only this spec**

Run: `npm run test:e2e -- differ-switch-branch.spec.js`
Expected: PASS.

- [ ] **Step 3: If it fails, inspect the artifacts (do not guess)**

Check the trace/screenshot. Likely adjustments: the indicator locator (it is a `<span>` in the toolbar — see `branch-indicator.js#createElement`; if `.differ-toolbar span` is ambiguous, narrow via the branch group), or the exact role/label text (`branch-indicator.js:50-59`). Re-render of the canvas is awaited by `toHaveCount(0)` auto-retry. Fix to match real DOM, then re-run Step 2.

- [ ] **Step 4: Commit**

```bash
git add test/e2e/differ-switch-branch.spec.js
git commit -m "test(e2e): cover BPMN differ switch-branch"
```

---

### Task 4: Changes-table + row-click feature test

Reveal the changes table, assert the added row, click it, and assert the canvas element gets the big highlight marker.

**Files:**
- Create: `test/e2e/differ-changes-table.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics` (Task 1).

- [ ] **Step 1: Write the test `test/e2e/differ-changes-table.spec.js`**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// The changes table is populated after render but hidden (display:none) until
// "Show changes". For the MR side it lists the added Task_2 ('Notify',
// ServiceTask). Clicking that row adds the big highlight marker to the element.
test('lists changes and highlights the element on row click', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    // Reveal the table.
    await page.getByRole('button', { name: 'Show changes' }).click();
    await expect(page.getByRole('button', { name: 'Hide changes' })).toBeVisible();

    const table = page.locator('table.changes-table');
    await expect(table).toBeVisible();

    // The added Task_2 row carries its id, name, type and the "added" marker.
    const taskRow = table.locator('tbody tr', { hasText: 'Task_2' });
    await expect(taskRow).toBeVisible();
    await expect(taskRow).toContainText('Notify');
    await expect(taskRow).toContainText('ServiceTask');
    await expect(taskRow).toContainText('added');

    // Clicking the row highlights the element on the canvas (big marker).
    await taskRow.click();
    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]'))
        .toHaveClass(/highlight-diff-big/);
});
```

- [ ] **Step 2: Run only this spec**

Run: `npm run test:e2e -- differ-changes-table.spec.js`
Expected: PASS.

- [ ] **Step 3: If it fails, inspect the artifacts (do not guess)**

Check the trace. Likely adjustments: the type cell text (BPMN type minus the `bpmn:` prefix — `changes-table-view.js`), the change-cell wording (`diff-type.js`: `added`/`changed`/`removed`), or the big-marker constant (`diff-highlighter.js:4`). The row click handler is `changes-table-view.js:198-213`. Fix to match, re-run Step 2.

- [ ] **Step 4: Commit**

```bash
git add test/e2e/differ-changes-table.spec.js
git commit -m "test(e2e): cover the BPMN changes table and row click"
```

---

### Task 5: SequenceFlow-condition-in-panel feature test

Select the conditional flow (`Flow_2`, `${approved == true}`) and assert the formatted condition is injected into the properties panel.

**Files:**
- Create: `test/e2e/differ-condition.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics` (Task 1).

- [ ] **Step 1: Write the test `test/e2e/differ-condition.spec.js`**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// Flow_2 (Task_1 → EndEvent_1) carries `${approved == true}`. Selecting it makes
// the differ hide the native condition input and inject div.properties-condition
// with the formatted expression. The properties panel mounts async; Playwright's
// auto-retrying expect waits for it.
test('shows the sequenceFlow condition in the properties panel', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    // The properties panel is mounted by show(); confirm before selecting.
    await expect(page.locator('.bio-properties-panel-scroll-container')).toBeVisible();

    // Select the conditional flow on the canvas (click its hit zone).
    const flow = page.locator('svg .djs-element[data-element-id="Flow_2"]');
    await flow.click();

    // The differ injects the formatted condition div next to the native field.
    const condition = page.locator('div.properties-condition');
    await expect(condition).toBeVisible();
    await expect(condition).toContainText('approved');
});
```

- [ ] **Step 2: Run only this spec**

Run: `npm run test:e2e -- differ-condition.spec.js`
Expected: PASS.

- [ ] **Step 3: If it fails, inspect the artifacts (do not guess)**

Most likely failure modes and where to look:
- The connection click did not select the flow → click the hit zone instead: `page.locator('svg .djs-element[data-element-id="Flow_2"] .djs-hit').click({ force: true })`. bpmn-js routes connection clicks through `.djs-hit`.
- `div.properties-condition` never appears → the panel may not render the condition group for this flow; open the trace DOM snapshot and check whether `#bio-properties-panel-conditionExpression` exists after selection (`properties-panel-highlighter.js:124`). If the panel needs the flow's properties group expanded first, replicate the production trigger (`bpmn-differ.js:516-522` `#onSelectedElementChanged`).
- Timing: the injection polls via `doWithAttempts(…, 30, 50)` (~1.5 s); the auto-retrying `toBeVisible` covers it, but raise the expect timeout if needed.
Fix to match real behavior, re-run Step 2. (If selecting a connection proves unreliable in headless, this is the one test worth confirming live before pinning its exact interaction — that is precisely why it was deferred from Phase 1 to run against a green harness.)

- [ ] **Step 4: Commit**

```bash
git add test/e2e/differ-condition.spec.js
git commit -m "test(e2e): cover the sequenceFlow condition in the properties panel"
```

---

### Task 6: Ctrl/Cmd+F search feature test

Open the search panel, type an element name, and assert the match marker + counter.

**Files:**
- Create: `test/e2e/differ-search.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics` (Task 1).

- [ ] **Step 1: Write the test `test/e2e/differ-search.spec.js`**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// Ctrl/Cmd+F opens the search panel (the handler keys on event.code 'KeyF' and
// preventDefaults Chrome's native find). Typing "Notify" matches Task_2; the
// matched element gets the search-match class and the counter shows the count.
test('finds an element via Ctrl/Cmd+F search', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    // Open the panel (Control works cross-platform — the handler accepts ctrlKey).
    await page.keyboard.press('Control+f');

    const panel = page.locator('.search-panel');
    await expect(panel).toBeVisible();
    const input = page.locator('input.search-panel-input');
    await expect(input).toBeFocused();

    await input.fill('Notify');

    // The matching element is marked on the canvas, and the counter is non-empty.
    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]'))
        .toHaveClass(/search-match/);
    await expect(page.locator('.search-panel-counter')).not.toBeEmpty();
});
```

- [ ] **Step 2: Run only this spec**

Run: `npm run test:e2e -- differ-search.spec.js`
Expected: PASS.

- [ ] **Step 3: If it fails, inspect the artifacts (do not guess)**

Likely adjustments: if `fill()` does not trigger the search, use `await input.pressSequentially('Notify')` (per-keystroke `input` events — see `search-panel.js#runSearch`); if `Control+f` is intercepted, try `page.keyboard.press('Meta+f')` on macOS runners or dispatch via `input` focus first; verify the panel/input/counter class names (`search-panel.js:91-120`) and the `search-match` marker (`search-panel.js:151`). Fix to match, re-run Step 2.

- [ ] **Step 4: Commit**

```bash
git add test/e2e/differ-search.spec.js
git commit -m "test(e2e): cover Ctrl/Cmd+F element search"
```

---

### Task 7: Full run + docs

Run the whole suite once and record the expanded coverage in the testing docs.

**Files:**
- Modify: `docs/testing.md`

- [ ] **Step 1: Run the full e2e suite**

Run: `npm run test:e2e`
Expected: PASS — `infra` + `differ-boot` + the five feature specs (7 tests total). Note the count.

- [ ] **Step 2: Run the unit suite**

Run: `npm test`
Expected: PASS, unchanged count, no `*.spec.js` picked up.

- [ ] **Step 3: Update the e2e section of `docs/testing.md`**

In the "E2E tests (Layer 2 — differ component)" section, replace the scope sentence:

> Scope so far is Phase 1 (the harness + a BPMN boot/render smoke test). Layer-2 feature tests and a DMN boot test reuse this harness; full Layer-3 e2e (loaded extension + synthetic platform pages) is deferred — see the spec under `docs/superpowers/specs/`.

with:

> Scope so far (Phase 1 + 1b): the harness, a BPMN boot/render smoke test, and Layer-2 feature tests for diff highlight, switch branch, the changes table + row click, the sequenceFlow condition in the properties panel, and Ctrl/Cmd+F search — all booting via the shared `test/e2e/support/boot-differ.js` helper and reusing the `test/e2e/fixtures/` pair. Still deferred: the rest of the differ checklist (zoom/fit, hide properties, dive-in overlays, empty/absent states, view-only copy invariants), a DMN boot test, and full Layer-3 e2e (loaded extension + synthetic platform pages) — see the spec under `docs/superpowers/specs/`.

Also add, after the layout bullet that mentions `fixtures/`, a one-liner on the helper:

> - `support/boot-differ.js` — the shared boot helper every BPMN spec imports: `bootBpmnDiffer(page, {params, fixtures})`, `defaultBpmnParams(overrides)`, `BPMN_FIXTURES`, `wireDiagnostics(page)`. Keeps the boot sequence (and the `utils.js` double-load neutralization) in one place.

- [ ] **Step 4: Commit**

```bash
git add docs/testing.md
git commit -m "docs(testing): record Phase 1b Layer-2 feature tests"
```

---

## Deferred to later plans (not Phase 1b)

- **Rest of the Layer-2 differ checklist** (spec Phase 2): zoom in/out/fit, hide properties, dive-in overlays into a Call Activity (needs a new call-activity fixture + a target-process entry in `xmlByRef`), empty/absent states (no XML — the fake's unknown-ref path), view-only copy invariants (BUG-0011→0015).
- **DMN boot test** — reuses the harness via a `bootDmnDiffer` sibling helper; needs a DI-bearing DMN fixture (dmn-js, like bpmn-js, needs DI to render).
- **Layer 3** — full e2e with the loaded extension + synthetic GitLab-shaped pages (spec Phase 3; carries the MV3-headless risk to validate first).

## Self-Review

**Spec coverage (the feature-test set the spec's Phase 1 named, deferred by the Phase-1 plan):**
- Diff highlight → Task 2. ✓
- Switch branch → Task 3. ✓
- Changes table + row click → Task 4. ✓
- Condition in the properties panel → Task 5. ✓
- Ctrl/Cmd+F search → Task 6. ✓
- Shared harness reuse (no duplicated boot logic) → Task 1 helper, consumed by 2-6. ✓
- AI-friendly artifacts (trace/screenshot/console mirror) → `wireDiagnostics` + the per-task "inspect the artifacts" step. ✓
- Rest of checklist + DMN + Layer 3 explicitly deferred → "Deferred" section. ✓

**Placeholder scan:** No TBD/TODO; every test step shows the full spec file; every assertion uses a source-verified selector. ✓

**Type consistency:** `bootBpmnDiffer` / `defaultBpmnParams` / `BPMN_FIXTURES` / `wireDiagnostics` are defined in Task 1 and used with those exact names/arities in Tasks 2-6. Selectors (`data-element-id`, `highlight-diff`/`-big`, `search-match`, `.search-panel(-input/-counter)`, `div.properties-condition`, `table.changes-table`) and labels ("Switch branch", "Show changes"/"Hide changes", titles "Turn diff highlight on/off") match the Verified-DOM-facts block, which cites source file:line. ✓

**Risk note:** Task 5 (connection click → panel injection) and Task 6 (keyboard-driven search) are the two interaction-heaviest tests; each carries an explicit Step-3 fallback (hit-zone click / `pressSequentially`). These are exactly the cases the Phase-1 plan deferred so they could be confirmed live against a green harness rather than guessed — verify them on the first run.
