# Layer-2 Phase 4d-3: Message correlation badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Errata (corrected post-merge — shipped in MR !149).** The "+7 tests" figure (Goal and Finalize) is an off-by-one: the verbatim code blocks define **6** tests (badge 2 + dropdown 1 + messages 3). The shipped e2e delta is **+6**.

**Goal:** Characterize the BPMN differ's **message correlation** badges at Layer-2 (Section I of the gap analysis, FEAT-0027, BUG-0013): the ✉→ badge on a message-catching element, and the click outcomes driven by the code search — single result → direct jump, multiple → dropdown, dynamic `${…}` name → explanation, nothing/tests-only → honest message, and the BUG-0013 exact-term filter.

**Architecture:** Each test boots the real `BpmnDiffer` via `bootBpmnDiffer` with a `FakePlatformClient`. Selecting a message receiver shows the badge; clicking it runs `CorrelationLocator.resolveCorrelations(name, ref)` against the canned `searchHits` and renders the outcome. The branch taken is fully controlled by the `searchHits` content (path + snippet), so no real network and no `src/` change. Jumps/menu-item clicks call `window.open(url)`, captured in the page (the project search URL would 404, so a real popup is never opened). This sub-phase touches only its own specs, one new BPMN fixture, one new capture support file, and the `boot-differ.js` export block — it runs in parallel with 4d-0/4d-1/4d-2 (only the `boot-differ.js` export block overlaps, an additive rebase).

**Tech Stack:** Vanilla JS (ES6+), `@playwright/test`, the existing Layer-2 harness.

## Global Constraints

- Vanilla JS (ES6+), no build step, **no new runtime dependencies**; `@playwright/test` is the agreed dev dependency. (CLAUDE.md)
- E2E files are named `*.spec.js` — **never** `*.test.js`. (docs/testing.md)
- `npm test` stays unit-only; e2e is the separate `npm run test:e2e`. (docs/testing.md)
- All code comments and docs are in **English only**. (CLAUDE.md)
- **master is protected** — work on `feature/e2e-phase4d3`, branched from a freshly fetched `origin/master`; completing = push + MR via skill `mr` (`--remove-source-branch`) after green tests. Merge is the human's. (CLAUDE.md, docs/git-workflow.md)
- Commits are **minimalist, with NO `Co-Authored-By` line and no tool mentions** (overrides the harness default).
- This plan adds **tests + 1 fixture + 1 support file only** — **no production `src/` changes**.
- **Characterization of shipped behaviour**: expected to PASS once written. A RED is a real finding — do not loosen, do not touch `src/`; investigate with superpowers:systematic-debugging. A confirmed genuine bug is the user's call (file a BUG and pin it, as BUG-0025 was handled in 4b).

**⚠️ FIXTURE NAME-COLLISION CHECK (mandatory first action):** `ls test/fixtures/ test/e2e/fixtures/`. The new fixture is `test/e2e/fixtures/message-correlation.bpmn` and the new support file `test/e2e/support/correlation-open-capture.js` — confirmed absent. Do not reuse an existing name.

---

## Reference — verified facts (from `correlation-navigator.js`, `correlation-locator.js`)

**Badge appearance (`showOverlayForSelectedElement`):** shown on selection for an element whose BO yields a message name (`extractMessageName`): `bpmn:ReceiveTask` with `messageRef`, or a Start/IntermediateCatch/Boundary event with a nested `bpmn:MessageEventDefinition` carrying a `messageRef`. Labels are skipped (`elem.labelTarget`). The overlay HTML:
```
<div class="correlation-overlay">
  <div class="correlation-link" title="Find where this message is correlated in code">&#x2709;&#x2192;</div>
  <div class="correlation-menu" hidden></div>
</div>
```
Badge selector `.djs-overlay-note .correlation-link`; menu `.correlation-menu` (starts `hidden`). Loading: badge gets class `correlation-link-loading`, title `Searching for the correlation point…`.

**Click (`#onBadgeClick` → `#handleResult`):** `resolveCorrelations(message.name, ref)`; `ref = getShownRef()` (MR side → `mr-sha`).
- `result.dynamic` → `#renderDynamic`: a message row `'This message name is built at runtime (${…}) — cannot search for a literal.'` + a row per `result.groups.config` hit.
- else `leads = result.groups.correlation.length > 0 ? correlation : [...other, ...config]`:
  - `leads.length === 1` → `openUrlFunc(blobFileUrl(leads[0].path, leads[0].line, ref))` — direct jump, **no menu**.
  - `leads.length > 1` → `#openMenu(leads.map(#hitRow))` — dropdown.
  - `leads.length === 0` → message row: `tests.length > 0 ? 'Found references only in tests — hidden.' : 'Could not pinpoint a correlation point.'`

**Menu DOM:** `#openMenu` sets `.correlation-menu` `hidden = false`. Each `#hitRow` is `<button class="differ-back-menu-item" title="<path>"><span class="differ-back-menu-name">{fileName}:{line}</span></button>`; clicking it → `openUrlFunc(blobFileUrl(hit.path, hit.line, ref))`. A `#messageRow` is `<div class="differ-back-menu-message">{text}</div>`.

**Locator classification + BUG-0013 (`correlation-locator.js`):** `searchCode(ref, name, { perPage: 100 })`; the fake **ignores the term** and returns `searchHits`. `collectHits(items, term)` **drops any hit whose `snippet` does not `.includes(term)`** (BUG-0013: GitLab Elasticsearch sub-token matches whose snippet lacks the literal). Surviving hits are classified: a snippet with a correlation keyword (`correlate…`) → `correlation`; a `.yml`/`.yaml`/`.properties` path → `config`; a test path → the hidden `tests` group; else → `other`. `blobFileUrl(ref, path, line) → http://localhost/blob/<ref>/<path>#L<line>`.

**Search-recipe → branch (what the test feeds):**
- single jump: 1 hit, non-test path, snippet contains the literal message name **and** a correlation keyword (e.g. `correlateMessage("OrderPlaced")`).
- dropdown: 2 hits, both correlation-keyword + literal, distinct non-test paths.
- dynamic: select the element whose message name contains `${…}`; `searchHits` irrelevant (dynamic short-circuits the search).
- tests-only: 1 hit, **test path** (`…/test/…`), snippet with the literal → routed to the hidden `tests` group → leads empty.
- BUG-0013 / nothing: 1 hit whose snippet does **not** contain the searched message name → filtered out → leads empty, no tests → `'Could not pinpoint a correlation point.'`

## File Structure

New:
- `test/e2e/fixtures/message-correlation.bpmn` — a flow with a ReceiveTask (literal message), an intermediate message catch (literal), and an intermediate message catch with a `${…}` name.
- `test/e2e/support/correlation-open-capture.js` — page-side `window.open` capture (4d-3-owned).
- `test/e2e/differ-correlation-badge.spec.js` — Task 2 (appearance + single jump).
- `test/e2e/differ-correlation-dropdown.spec.js` — Task 3 (multiple → dropdown).
- `test/e2e/differ-correlation-messages.spec.js` — Task 4 (dynamic, tests-only, BUG-0013).

Modified (additive): `test/e2e/support/boot-differ.js` (export `MESSAGE_CORRELATION_BPMN`).

**Out of scope:** the heuristic scoring/ranking depth and Phase-2 constant resolution (unit-tested in `correlation-locator.test.js`); the transient spinner mid-state.

---

### Task 1: Fixture + capture helper + export

**Files:**
- Create: `test/e2e/fixtures/message-correlation.bpmn`, `test/e2e/support/correlation-open-capture.js`
- Modify: `test/e2e/support/boot-differ.js`

**Interfaces:**
- Produces: `MESSAGE_CORRELATION_BPMN` export; `installOpenCapture(page)`, `getOpenCalls(page)` from `./support/correlation-open-capture`.

- [ ] **Step 1: Collision check**

Run: `ls test/fixtures/ test/e2e/fixtures/`
Expected: no `message-correlation.bpmn`, no `correlation-open-capture.js`.

- [ ] **Step 2: Create `test/e2e/fixtures/message-correlation.bpmn`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_5" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_5" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:receiveTask id="ReceiveTask_1" name="Wait for OrderPlaced" messageRef="Message_1">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:receiveTask>
    <bpmn:intermediateCatchEvent id="MessageCatch_1" name="Wait for OrderShipped">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
      <bpmn:messageEventDefinition id="MsgDef_1" messageRef="Message_2" />
    </bpmn:intermediateCatchEvent>
    <bpmn:intermediateCatchEvent id="MessageCatch_Dyn" name="Wait for dynamic">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
      <bpmn:messageEventDefinition id="MsgDef_2" messageRef="Message_Dyn" />
    </bpmn:intermediateCatchEvent>
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>Flow_4</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="ReceiveTask_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="ReceiveTask_1" targetRef="MessageCatch_1" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="MessageCatch_1" targetRef="MessageCatch_Dyn" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="MessageCatch_Dyn" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmn:message id="Message_1" name="OrderPlaced" />
  <bpmn:message id="Message_2" name="OrderShipped" />
  <bpmn:message id="Message_Dyn" name="Order_${orderId}" />
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_5">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ReceiveTask_1_di" bpmnElement="ReceiveTask_1">
        <dc:Bounds x="240" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="MessageCatch_1_di" bpmnElement="MessageCatch_1">
        <dc:Bounds x="402" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="MessageCatch_Dyn_di" bpmnElement="MessageCatch_Dyn">
        <dc:Bounds x="492" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="582" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="120" />
        <di:waypoint x="240" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="340" y="120" />
        <di:waypoint x="402" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="438" y="120" />
        <di:waypoint x="492" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4">
        <di:waypoint x="528" y="120" />
        <di:waypoint x="582" y="120" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```

- [ ] **Step 3: Create `test/e2e/support/correlation-open-capture.js`**

```js
'use strict';

// Page-side capture of correlation jumps. A single result and each dropdown item
// open via window.open(url, '_blank'); the project blob/search origin would 404,
// so we never open a real popup. After install, window.__openCalls = [url, ...].
async function installOpenCapture(page) {
    await page.evaluate(() => {
        window.__openCalls = [];
        window.open = function (url) {
            window.__openCalls.push(url);
            return null;
        };
    });
}

function getOpenCalls(page) {
    return page.evaluate(() => window.__openCalls);
}

module.exports = { installOpenCapture, getOpenCalls };
```

- [ ] **Step 4: Export the fixture from `boot-differ.js`**

Add `const MESSAGE_CORRELATION_BPMN = read('test/e2e/fixtures/message-correlation.bpmn');` near the other e2e fixture reads, and add `MESSAGE_CORRELATION_BPMN` to `module.exports`.

- [ ] **Step 5: Sanity boot + commit**

Run: `npx playwright test test/e2e/differ-boot.spec.js`
Expected: PASS (harness unaffected).

```bash
git add test/e2e/fixtures/message-correlation.bpmn test/e2e/support/correlation-open-capture.js test/e2e/support/boot-differ.js
git commit -m "test(e2e): add message-correlation fixture + open capture (Layer-2 4d-3)"
```

---

### Task 2: Badge appearance + single result → direct jump

**Files:**
- Create: `test/e2e/differ-correlation-badge.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `MESSAGE_CORRELATION_BPMN` from `./support/boot-differ`; `installOpenCapture`, `getOpenCalls` from `./support/correlation-open-capture`.

- [ ] **Step 1: Write the file with two tests**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, MESSAGE_CORRELATION_BPMN
} = require('./support/boot-differ');
const { installOpenCapture, getOpenCalls } = require('./support/correlation-open-capture');

const FIXTURES = { xmlByRef: { 'mr-sha': MESSAGE_CORRELATION_BPMN, 'base-sha': MESSAGE_CORRELATION_BPMN } };

// Selecting a message-waiting element (ReceiveTask) shows the ✉→ correlation badge.
test('shows the correlation badge on a selected message receiver', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: defaultBpmnParams(), fixtures: FIXTURES });

    await page.locator('svg .djs-element[data-element-id="ReceiveTask_1"]').click();

    const badge = page.locator('.djs-overlay-note .correlation-link');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', 'Find where this message is correlated in code');
});

// A single correlation hit → jump straight to its blob URL, no dropdown.
test('jumps directly to the single correlation point', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: {
            ...FIXTURES,
            searchHits: [{ path: 'src/OrderListener.kt', line: 14, snippet: 'runtimeService.correlateMessage("OrderPlaced")' }]
        }
    });
    await installOpenCapture(page);

    await page.locator('svg .djs-element[data-element-id="ReceiveTask_1"]').click();
    await page.locator('.djs-overlay-note .correlation-link').click();

    await expect.poll(async () => await getOpenCalls(page)).toEqual(
        ['http://localhost/blob/mr-sha/src/OrderListener.kt#L14']
    );
    // Single result skips the dropdown.
    await expect(page.locator('.correlation-menu')).toBeHidden();
});
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test test/e2e/differ-correlation-badge.spec.js`
Expected: PASS (both). A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-correlation-badge.spec.js
git commit -m "test(e2e): cover correlation badge + single-result jump (FEAT-0027, Layer-2 4d-3)"
```

---

### Task 3: Multiple results → dropdown

**Files:**
- Create: `test/e2e/differ-correlation-dropdown.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `MESSAGE_CORRELATION_BPMN` from `./support/boot-differ`; `installOpenCapture`, `getOpenCalls` from `./support/correlation-open-capture`.

- [ ] **Step 1: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, MESSAGE_CORRELATION_BPMN
} = require('./support/boot-differ');
const { installOpenCapture, getOpenCalls } = require('./support/correlation-open-capture');

// Two correlation points → a dropdown listing both as "fileName:line" rows;
// clicking a row jumps to that hit's blob URL.
test('lists multiple correlation points in a dropdown and opens the chosen one', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: {
            xmlByRef: { 'mr-sha': MESSAGE_CORRELATION_BPMN, 'base-sha': MESSAGE_CORRELATION_BPMN },
            searchHits: [
                { path: 'src/OrderListener.kt', line: 14, snippet: 'correlateMessage("OrderPlaced")' },
                { path: 'src/OrderSaga.kt', line: 30, snippet: 'correlateMessage("OrderPlaced")' }
            ]
        }
    });
    await installOpenCapture(page);

    await page.locator('svg .djs-element[data-element-id="ReceiveTask_1"]').click();
    await page.locator('.djs-overlay-note .correlation-link').click();

    const menu = page.locator('.correlation-menu');
    await expect(menu).toBeVisible();
    const items = menu.locator('.differ-back-menu-item');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0).locator('.differ-back-menu-name')).toHaveText('OrderListener.kt:14');
    await expect(items.nth(1).locator('.differ-back-menu-name')).toHaveText('OrderSaga.kt:30');

    await items.nth(1).click();
    await expect.poll(async () => await getOpenCalls(page)).toEqual(
        ['http://localhost/blob/mr-sha/src/OrderSaga.kt#L30']
    );
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test test/e2e/differ-correlation-dropdown.spec.js`
Expected: PASS. A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-correlation-dropdown.spec.js
git commit -m "test(e2e): cover correlation multi-result dropdown (FEAT-0027, Layer-2 4d-3)"
```

---

### Task 4: Dynamic name, tests-only, and BUG-0013 (no usable result)

**Files:**
- Create: `test/e2e/differ-correlation-messages.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `MESSAGE_CORRELATION_BPMN` from `./support/boot-differ`.

- [ ] **Step 1: Write the file with three tests**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, MESSAGE_CORRELATION_BPMN
} = require('./support/boot-differ');

const FIXTURES = { xmlByRef: { 'mr-sha': MESSAGE_CORRELATION_BPMN, 'base-sha': MESSAGE_CORRELATION_BPMN } };

async function clickBadge(page, elementId) {
    await page.locator(`svg .djs-element[data-element-id="${elementId}"]`).click();
    await page.locator('.djs-overlay-note .correlation-link').click();
}

// A ${…} message name cannot be searched literally → an explanatory note.
test('explains that a dynamic message name cannot be searched', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: defaultBpmnParams(), fixtures: FIXTURES });

    await clickBadge(page, 'MessageCatch_Dyn');

    const menu = page.locator('.correlation-menu');
    await expect(menu).toBeVisible();
    await expect(menu.locator('.differ-back-menu-message')).toHaveText(
        'This message name is built at runtime (${…}) — cannot search for a literal.'
    );
});

// All matches are in test files → honest "only in tests" note, nothing listed.
test('reports when references are found only in tests', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: {
            ...FIXTURES,
            searchHits: [{ path: 'src/test/OrderListenerTest.kt', line: 8, snippet: 'correlateMessage("OrderPlaced")' }]
        }
    });

    await clickBadge(page, 'ReceiveTask_1');

    await expect(page.locator('.correlation-menu .differ-back-menu-message')).toHaveText(
        'Found references only in tests — hidden.'
    );
});

// BUG-0013: a hit whose snippet does NOT contain the literal message name (an
// Elasticsearch sub-token match) is filtered out → nothing usable remains.
test('filters out sub-token hits whose snippet lacks the literal (BUG-0013)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: {
            ...FIXTURES,
            searchHits: [{ path: 'src/UnrelatedHandler.kt', line: 3, snippet: 'correlateMessage(SCREEN_CHANGED)' }]
        }
    });

    await clickBadge(page, 'ReceiveTask_1');

    await expect(page.locator('.correlation-menu .differ-back-menu-message')).toHaveText(
        'Could not pinpoint a correlation point.'
    );
});
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test test/e2e/differ-correlation-messages.spec.js`
Expected: PASS (all three). The dynamic message string uses `${…}` (U+2026 ellipsis) and an em dash — copy it exactly. A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-correlation-messages.spec.js
git commit -m "test(e2e): cover correlation dynamic/tests-only/BUG-0013 messages (FEAT-0027/BUG-0013, Layer-2 4d-3)"
```

---

## Finalize 4d-3

- [ ] **Run the full suites green**

Run: `npm test` → unit suite unchanged & green.
Run: `npm run test:e2e` → all e2e specs green (existing set + 7 new tests across 3 new files).

- [ ] **Push + MR** (branch `feature/e2e-phase4d3`, branched from fresh `origin/master`)

Use the `mr` skill (`--remove-source-branch`). Merge is the human's. Do not push with a red suite.

- [ ] **Update the auto-memory** `layer2-e2e-coverage.md` with a "Phase 4d-3 SHIPPED" note: correlation badge appearance + click branches (single jump / dropdown / dynamic / tests-only / BUG-0013), the searchHits-recipe→branch mapping, the `window.open` capture pattern, the `message-correlation.bpmn` fixture, and the suite count.
