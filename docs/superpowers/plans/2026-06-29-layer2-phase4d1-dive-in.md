# Layer-2 Phase 4d-1: Dive-in click flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Characterize the BPMN differ's **dive-in** navigation at Layer-2 (Section G of the gap analysis): clicking the dive-in badge on a selected Call Activity (`calledElement`) or a Business Rule Task (`camunda:decisionRef`, FEAT-0005) resolves the called file via `searchCode` and opens a nested differ tab with the correct params — plus the search-page fallback when resolution fails, and the loading spinner (UX-0008).

**Architecture:** Each test boots the real `BpmnDiffer` via `bootBpmnDiffer` with a `FakePlatformClient`, then clicks the badge. **A real nested tab cannot render in Layer-2**: dive-in calls the global `openDiffer(params, …)`, which does `window.open('about:blank')` + load scripts + `postMessage({id, params})`; the nested tab's `main()` then calls `createPlatformClient(params.platform)`, which **throws `unsupported platform kind: fake`**. So the tests **stub the tab-opening primitives** (`window.openDiffer` and `window.open`) in the page and characterize the *resolved params* the differ would have passed — the real protection (does `searchCode` resolution + nested-param wiring + BPMN/DMN routing still work). No `src/` change. The capture lives in a new, 4d-1-owned support file; the spinner is made observable by slowing the fake's `searchCode` via an in-spec prototype patch (no shared-file edit). Touches only its own specs, one new fixture, the new support file, and the `boot-differ.js` export block — runs fully in parallel with 4d-0/4d-2/4d-3.

**Tech Stack:** Vanilla JS (ES6+), `@playwright/test`, the existing Layer-2 harness.

## Global Constraints

- Vanilla JS (ES6+), no build step, **no new runtime dependencies**; `@playwright/test` is the agreed dev dependency. (CLAUDE.md)
- E2E files are named `*.spec.js` — **never** `*.test.js`. (docs/testing.md)
- `npm test` stays unit-only; e2e is the separate `npm run test:e2e`. (docs/testing.md)
- All code comments and docs are in **English only**. (CLAUDE.md)
- **master is protected** — work on `feature/e2e-phase4d1`, branched from a freshly fetched `origin/master`; completing = push + MR via skill `mr` (`--remove-source-branch`) after green tests. Merge is the human's. (CLAUDE.md, docs/git-workflow.md)
- Commits are **minimalist, with NO `Co-Authored-By` line and no tool mentions** (overrides the harness default).
- This plan adds **tests + 1 fixture + 1 support file only** — **no production `src/` changes**.
- **Characterization of shipped behaviour**: expected to PASS once written. A RED is a real finding — do not loosen, do not touch `src/`; investigate with superpowers:systematic-debugging. A red that exposes a genuine bug is the user's call (surface options; if confirmed, file a BUG and pin it, as BUG-0025 was handled in 4b).
- ⚠️ **BUG-0005** ("tab blocked on first dive-in") is an OPEN/unfixed bug — do NOT attempt to characterize it as correct behaviour; it is out of scope here.

**⚠️ FIXTURE NAME-COLLISION CHECK (mandatory first action):** `ls test/fixtures/ test/e2e/fixtures/`. The one new fixture is `test/e2e/fixtures/business-rule-task.bpmn` — confirmed absent. The Call Activity tests **reuse** the existing `test/e2e/fixtures/call-activity.bpmn` (`CALL_ACTIVITY_BPMN`, already exported). Do not recreate it.

---

## Reference — verified facts (from `call-activity-navigator.js`, `call-activity-locator.js`, `decision-navigator.js`, `decision-locator.js`, `bpmn-differ.js`, `differ-params.js`, `differ-tab-navigator.js`, `core/utils.js`)

**Badge DOM (both navigators):** selecting the element adds a bpmn-js `note` overlay with HTML `<div class="dive-in-call-activity"></div>`; the badge is `.djs-overlay.djs-overlay-note[data-overlay-id="…"] .dive-in-call-activity`. Default (idle) state: `innerHTML = '&#x2935;'`, `title` = `'Open the called diagram'` (Call Activity) / `'Open the called decision'` (Decision). Loading state (`#refreshBadge` while `#isHandling`): adds class **`dive-in-loading`**, sets `innerHTML = '<span class="differ-spinner-inline"></span>'`, `title` = `'Loading the called diagram…'` / `'Loading the called decision…'`.

**Triggers:** Call Activity badge needs `elem.type === 'bpmn:CallActivity'` and `businessObject.calledElement` (the processId). Decision badge needs `elem.type === 'bpmn:BusinessRuleTask'` and `businessObject.decisionRef` (set via `camunda:decisionRef`).

**Click chain (`#onDiveIn`):** `isHandling=true` → `#refreshBadge()` (spinner ON) → `ref = getShownRef()` (the MR side shown first → `sourceRef='mr-sha'`) → `await locator.resolveProcessFile(processId, ref)` / `resolveDecisionFile(decisionRef, ref)` → if a result, `await openDifferFunc(result.filePath, result.fileName)`; else `openUrlFunc(locator.blobSearchPageUrl(id, ref))` → `finally { isHandling=false; #refreshBadge() }` (spinner OFF).

**Resolution (`call-activity-locator.js` / `decision-locator.js`):** `searchCode(ref, 'process id="<id>"')` / `searchCode(ref, 'decision id="<id>"')`. `selectProcessFile` keeps only `.bpmn` hits and prefers one whose `snippet` contains `process id="<id>"`; `selectDecisionFile` keeps only `.dmn` hits and prefers `decision id="<id>"`. Returns `{ filePath: hit.path, fileName: getFileNameFromPath(hit.path) }` or `null`. `blobSearchPageUrl(id, ref) → client.searchPageUrl(id, ref)`.

**Tab open (`bpmn-differ.js` wiring + `differ-tab-navigator.js` + `core/utils.js`):**
- `openDifferFunc = (filePath, fileName) => this.#diveIntoCalledDiffer(filePath, fileName)` → `#openDifferForFile(filePath, fileName, { divedInFrom: { filePath: this.#params.filePath, fileName: this.#params.fileName } })`.
- `#openDifferForFile` first `await this.#tabNavigator.focusExistingDifferTab(identityKey)` (a BroadcastChannel "who-has" query; no other tab answers in Layer-2 → resolves `false` after the ~150ms timeout), then `params = toNestedDifferParams(filePath, fileName, extra)` and `await this.#tabNavigator.openNestedDiffer(params, fileName)`.
- `openNestedDiffer(params, fileName)` computes `msgId = /\.dmn$/i.test(fileName) ? DmnDiffer.MSG_ID : BpmnDiffer.MSG_ID` and calls the **global** `openDiffer(params, null, msgId, …)`.
- `openDiffer` (in `core/utils.js`) does `window.open('about:blank')` + `loadScripts` + `newWindow.postMessage({ id: msgId, params }, '*')`. It is a top-level `function`, i.e. reassigning `window.openDiffer` overrides the binding the bare `openDiffer(...)` call resolves at call time.
- `openUrlFunc = (url) => window.open(url, '_blank')` (the fallback opener; the call ignores its return value).

**`toNestedDifferParams(filePath, fileName, extra)` returns:** `{ platform, sourceRef, sourceLabel, changeRequestId, targetRef, targetLabel, filePath, fileName, camundaBpmnModdle, ...extra }` (no `localFileContent`). With `defaultBpmnParams`: `sourceRef:'mr-sha'`, `sourceLabel:'feature'`, `changeRequestId: undefined`, `targetRef:'base-sha'`, `targetLabel:'master'`, `platform.kind:'fake'`, caller `filePath/fileName:'diagram.bpmn'`. So a dive-in's captured `params.divedInFrom === { filePath:'diagram.bpmn', fileName:'diagram.bpmn' }`.

**`call-activity.bpmn` (existing):** `Process_2` with `callActivity id="CallActivity_1" calledElement="Sub_Process"`. **The fake's `searchCode` ignores the term and returns the canned `searchHits`** — so the hit path/snippet fully control the resolved file.

## File Structure

New:
- `test/e2e/fixtures/business-rule-task.bpmn` — a diagrammed BusinessRuleTask carrying `camunda:decisionRef="My_Decision"`.
- `test/e2e/support/dive-in-capture.js` — page-side capture of `window.openDiffer` + `window.open` (4d-1-owned; no shared edit).
- `test/e2e/differ-dive-in-call-activity.spec.js` — Task 2 (resolve→params+msgId, fallback, spinner).
- `test/e2e/differ-dive-in-decision.spec.js` — Task 3 (resolve→params+DMN routing, fallback).

Modified (additive): `test/e2e/support/boot-differ.js` — read + export `BUSINESS_RULE_TASK_BPMN`.

**Out of scope:** the actual rendering of the nested tab (impossible with the fake client); cross-tab reuse (BUG-0017 → 4e); BUG-0005.

---

### Task 1: Capture helper + decision fixture + boot export

**Files:**
- Create: `test/e2e/support/dive-in-capture.js`, `test/e2e/fixtures/business-rule-task.bpmn`
- Modify: `test/e2e/support/boot-differ.js`

**Interfaces:**
- Produces: `installTabCapture(page)`, `getOpenDifferCalls(page)`, `getOpenUrlCalls(page)` from `./support/dive-in-capture`; `BUSINESS_RULE_TASK_BPMN` export from `./support/boot-differ`.

- [ ] **Step 1: Collision check**

Run: `ls test/fixtures/ test/e2e/fixtures/`
Expected: no `business-rule-task.bpmn`, no `dive-in-capture.js`.

- [ ] **Step 2: Create `test/e2e/support/dive-in-capture.js`**

```js
'use strict';

// Page-side capture of the differ's tab-opening primitives, so dive-in flows can
// be characterized WITHOUT rendering a nested tab. A nested tab rebuilds its client
// via createPlatformClient(params.platform), which throws for the fake 'fake' kind,
// so we never let the real openDiffer run. After install:
//   window.__openDifferCalls — [{ params, msgId }] for each openDiffer(...) call
//   window.__openUrlCalls    — [url] for each window.open(url, ...) call
// openDiffer is a top-level function in utils.js, so overriding window.openDiffer
// replaces the binding the bare `openDiffer(...)` call site resolves at call time.
async function installTabCapture(page) {
    await page.evaluate(() => {
        window.__openDifferCalls = [];
        window.__openUrlCalls = [];
        window.openDiffer = async function (params, extParams, msgId) {
            window.__openDifferCalls.push({ params, msgId });
            return true;
        };
        window.open = function (url) {
            window.__openUrlCalls.push(url);
            return null;   // the dive-in fallback ignores the return value
        };
    });
}

function getOpenDifferCalls(page) {
    return page.evaluate(() => window.__openDifferCalls);
}

function getOpenUrlCalls(page) {
    return page.evaluate(() => window.__openUrlCalls);
}

module.exports = { installTabCapture, getOpenDifferCalls, getOpenUrlCalls };
```

- [ ] **Step 3: Create `test/e2e/fixtures/business-rule-task.bpmn`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_3" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_3" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:businessRuleTask id="BusinessRuleTask_1" name="Decide discount" camunda:decisionRef="My_Decision">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:businessRuleTask>
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="BusinessRuleTask_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="BusinessRuleTask_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_3">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="82" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="BusinessRuleTask_1_di" bpmnElement="BusinessRuleTask_1">
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

- [ ] **Step 4: Export the fixture from `boot-differ.js`**

Add near the other `test/e2e/fixtures/*.bpmn` reads:

```js
const BUSINESS_RULE_TASK_BPMN = read('test/e2e/fixtures/business-rule-task.bpmn');
```

and add `BUSINESS_RULE_TASK_BPMN` to `module.exports`.

- [ ] **Step 5: Sanity boot + commit**

Run: `npx playwright test test/e2e/differ-dive-in.spec.js`
Expected: PASS (existing badge-appearance spec still green; confirms harness unaffected).

```bash
git add test/e2e/support/dive-in-capture.js test/e2e/fixtures/business-rule-task.bpmn test/e2e/support/boot-differ.js
git commit -m "test(e2e): add dive-in tab-capture helper + business-rule-task fixture (Layer-2 4d-1)"
```

---

### Task 2: Call Activity dive-in — resolve→params, fallback, spinner

**Files:**
- Create: `test/e2e/differ-dive-in-call-activity.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `CALL_ACTIVITY_BPMN` from `./support/boot-differ`; `installTabCapture`, `getOpenDifferCalls`, `getOpenUrlCalls` from `./support/dive-in-capture`.

- [ ] **Step 1: Write the file with three tests**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, CALL_ACTIVITY_BPMN
} = require('./support/boot-differ');
const {
    installTabCapture, getOpenDifferCalls, getOpenUrlCalls
} = require('./support/dive-in-capture');

const CALLED_HIT = {
    path: 'processes/sub-process.bpmn',
    line: 1,
    snippet: '<bpmn:process id="Sub_Process">'
};

async function selectCallActivity(page) {
    await page.locator('svg .djs-element[data-element-id="CallActivity_1"]').click();
    return page.locator('.djs-overlay-note .dive-in-call-activity');
}

// Clicking the dive-in badge resolves the called process file via searchCode and
// opens a nested differ. The fake returns CALLED_HIT, so the resolved file is
// sub-process.bpmn; the nested params carry the same platform/refs, the resolved
// file path/name, and the divedInFrom hint pointing back at this diagram. The
// nested file is .bpmn, so the BPMN message id is used (BPMN→BPMN routing).
test('resolves the called process and opens a nested differ with correct params', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': CALL_ACTIVITY_BPMN, 'base-sha': CALL_ACTIVITY_BPMN }, searchHits: [CALLED_HIT] }
    });
    await installTabCapture(page);
    const bpmnMsgId = await page.evaluate(() => BpmnDiffer.MSG_ID);

    const badge = await selectCallActivity(page);
    await badge.click();

    await expect.poll(async () => (await getOpenDifferCalls(page)).length).toBe(1);
    const [call] = await getOpenDifferCalls(page);
    expect(call.params.filePath).toBe('processes/sub-process.bpmn');
    expect(call.params.fileName).toBe('sub-process.bpmn');
    expect(call.params.sourceRef).toBe('mr-sha');
    expect(call.params.targetRef).toBe('base-sha');
    expect(call.params.platform.kind).toBe('fake');
    expect(call.params.divedInFrom).toEqual({ filePath: 'diagram.bpmn', fileName: 'diagram.bpmn' });
    expect(call.msgId).toBe(bpmnMsgId);
    // The resolve path opened the nested differ, not a plain URL tab.
    expect(await getOpenUrlCalls(page)).toEqual([]);
});

// When resolution finds no matching file (empty search results), the badge opens
// the human-facing repo search page for the process id instead of a nested differ.
test('falls back to the repo search page when the called file is not found', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': CALL_ACTIVITY_BPMN, 'base-sha': CALL_ACTIVITY_BPMN }, searchHits: [] }
    });
    await installTabCapture(page);

    const badge = await selectCallActivity(page);
    await badge.click();

    await expect.poll(async () => (await getOpenUrlCalls(page)).length).toBe(1);
    expect(await getOpenUrlCalls(page)).toEqual(['http://localhost/search?term=Sub_Process']);
    // No nested differ was opened.
    expect(await getOpenDifferCalls(page)).toEqual([]);
});

// UX-0008: while the resolve is in flight the badge shows a spinner (dive-in-loading
// class + "Loading…" title); when it finishes the arrow returns. We slow the fake's
// searchCode so the loading state is deterministically observable.
test('shows the loading spinner while resolving, then restores the arrow', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': CALL_ACTIVITY_BPMN, 'base-sha': CALL_ACTIVITY_BPMN }, searchHits: [CALLED_HIT] }
    });
    await installTabCapture(page);
    await page.evaluate((ms) => {
        const orig = FakePlatformClient.prototype.searchCode;
        FakePlatformClient.prototype.searchCode = async function (...args) {
            await new Promise((r) => setTimeout(r, ms));
            return orig.apply(this, args);
        };
    }, 250);

    const badge = await selectCallActivity(page);
    await badge.click();

    // During the slowed resolve: spinner on.
    await expect(badge).toHaveClass(/dive-in-loading/);
    await expect(badge).toHaveAttribute('title', 'Loading the called diagram…');

    // After it completes (openDiffer captured): spinner off, arrow restored.
    await expect.poll(async () => (await getOpenDifferCalls(page)).length).toBe(1);
    await expect(badge).not.toHaveClass(/dive-in-loading/);
    await expect(badge).toHaveAttribute('title', 'Open the called diagram');
});
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test test/e2e/differ-dive-in-call-activity.spec.js`
Expected: PASS (all three). A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-dive-in-call-activity.spec.js
git commit -m "test(e2e): cover Call Activity dive-in resolve/fallback/spinner (Layer-2 4d-1)"
```

---

### Task 3: Decision dive-in — resolve→params (BPMN→DMN routing), fallback (FEAT-0005)

**Files:**
- Create: `test/e2e/differ-dive-in-decision.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `BUSINESS_RULE_TASK_BPMN` from `./support/boot-differ`; `installTabCapture`, `getOpenDifferCalls`, `getOpenUrlCalls` from `./support/dive-in-capture`.

- [ ] **Step 1: Write the file with two tests**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, BUSINESS_RULE_TASK_BPMN
} = require('./support/boot-differ');
const {
    installTabCapture, getOpenDifferCalls, getOpenUrlCalls
} = require('./support/dive-in-capture');

const DECISION_HIT = {
    path: 'decisions/my-decision.dmn',
    line: 1,
    snippet: '<decision id="My_Decision">'
};

async function selectBusinessRuleTask(page) {
    await page.locator('svg .djs-element[data-element-id="BusinessRuleTask_1"]').click();
    return page.locator('.djs-overlay-note .dive-in-call-activity');
}

// FEAT-0005: diving into a Business Rule Task resolves the called DECISION file and
// opens the DMN differ. The resolved file is .dmn, so openDiffer is invoked with the
// DMN message id (BPMN→DMN routing) and the DMN file path/name.
test('resolves the called decision and opens the DMN differ (BPMN to DMN routing)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': BUSINESS_RULE_TASK_BPMN, 'base-sha': BUSINESS_RULE_TASK_BPMN }, searchHits: [DECISION_HIT] }
    });
    await installTabCapture(page);
    const dmnMsgId = await page.evaluate(() => DmnDiffer.MSG_ID);

    const badge = await selectBusinessRuleTask(page);
    await expect(badge).toHaveAttribute('title', 'Open the called decision');
    await badge.click();

    await expect.poll(async () => (await getOpenDifferCalls(page)).length).toBe(1);
    const [call] = await getOpenDifferCalls(page);
    expect(call.params.filePath).toBe('decisions/my-decision.dmn');
    expect(call.params.fileName).toBe('my-decision.dmn');
    expect(call.params.divedInFrom).toEqual({ filePath: 'diagram.bpmn', fileName: 'diagram.bpmn' });
    expect(call.msgId).toBe(dmnMsgId);
    expect(await getOpenUrlCalls(page)).toEqual([]);
});

// No DMN hit → fall back to the repo search page for the decision id.
test('falls back to the repo search page when the decision file is not found', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': BUSINESS_RULE_TASK_BPMN, 'base-sha': BUSINESS_RULE_TASK_BPMN }, searchHits: [] }
    });
    await installTabCapture(page);

    const badge = await selectBusinessRuleTask(page);
    await badge.click();

    await expect.poll(async () => (await getOpenUrlCalls(page)).length).toBe(1);
    expect(await getOpenUrlCalls(page)).toEqual(['http://localhost/search?term=My_Decision']);
    expect(await getOpenDifferCalls(page)).toEqual([]);
});
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test test/e2e/differ-dive-in-decision.spec.js`
Expected: PASS (both). If the badge does not appear, confirm `camunda:decisionRef` resolves to `businessObject.decisionRef` (the camunda moddle is wired via `defaultBpmnParams().camundaBpmnModdle`). A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-dive-in-decision.spec.js
git commit -m "test(e2e): cover decision dive-in BPMN-to-DMN routing + fallback (FEAT-0005, Layer-2 4d-1)"
```

---

## Finalize 4d-1

- [ ] **Run the full suites green**

Run: `npm test` → unit suite unchanged & green.
Run: `npm run test:e2e` → all e2e specs green (existing set + 5 new tests across 2 new files).

- [ ] **Push + MR** (branch `feature/e2e-phase4d1`, branched from fresh `origin/master`)

Use the `mr` skill (`--remove-source-branch`). Merge is the human's. Do not push with a red suite.

- [ ] **Update the auto-memory** `layer2-e2e-coverage.md` with a "Phase 4d-1 SHIPPED" note: dive-in resolve→nested-params characterization, the `openDiffer`/`window.open` capture pattern (and WHY a real nested tab can't render — `createPlatformClient('fake')` throws), the slowed-`searchCode` spinner pattern, BPMN→DMN routing via msgId, the new `business-rule-task.bpmn` fixture, and the suite count.
