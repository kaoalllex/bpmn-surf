# Layer-2 Phase 4d-2: Handler/delegate badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Errata (corrected post-merge — shipped in MR !150).** The "+8 tests" figure (Goal and Finalize) is an off-by-one: the verbatim code blocks define **7** tests (selection 2 + changed 1 + dedup 1 + click 3). The shipped e2e delta is **+7**.

**Goal:** Characterize the BPMN differ's **handler/delegate badges** at Layer-2 (Section H of the gap analysis, *full* depth — FEAT-0003/0004/0018, BUG-0016, BUG-0013): the neutral on-selection "open handler code" badge, the permanent MR-changed badges coloured added/changed/removed, the message-event handler (FEAT-0018), the labelled-element dedup (BUG-0016), and the click flows (changed → MR-diff via the opener-tab fallback; unchanged → blob URL or repo-search fallback in a new tab).

**Architecture:** Each test boots the real `BpmnDiffer` via `bootBpmnDiffer` with a `FakePlatformClient`. The permanent badges come from `HandlerLocator.findChangedHandlers(changeRequestId, sourceRef, targetRef)`, which fetches each changed handler **source file** (via `rawFileUrl(ref, path)`) and parses handler keys from its content — so the test must supply per-(ref,path) **source content** distinct from the diagram XML. The fake currently keys `rawFileUrl` by ref only, so this sub-phase makes **one backward-compatible additive change to `fake-platform-client.js`** (a `contentByRefPath` map consulted before the `xmlByRef[ref]` fallback). Badge clicks open tabs via `window.open` (no `openDiffer`); `navigateOpenerTab` returns `false` in Layer-2 (no `window.opener`), so a changed-handler click falls back to `window.open(mrDiffUrl)`. Clicks are characterized by capturing `window.open` in the page. This sub-phase touches its own specs, one new BPMN fixture, one new capture support file, the `boot-differ.js` export block, and the one fake edit — it runs in parallel with 4d-0/4d-1/4d-3 (only the `boot-differ.js` export block overlaps, an additive rebase; `fake-platform-client.js` is edited by **this sub-phase only**).

**Tech Stack:** Vanilla JS (ES6+), `@playwright/test`, the existing Layer-2 harness.

## Global Constraints

- Vanilla JS (ES6+), no build step, **no new runtime dependencies**; `@playwright/test` is the agreed dev dependency. (CLAUDE.md)
- E2E files are named `*.spec.js` — **never** `*.test.js`. (docs/testing.md)
- `npm test` stays unit-only; e2e is the separate `npm run test:e2e`. (docs/testing.md)
- All code comments and docs are in **English only**. (CLAUDE.md)
- **master is protected** — work on `feature/e2e-phase4d2`, branched from a freshly fetched `origin/master`; completing = push + MR via skill `mr` (`--remove-source-branch`) after green tests. Merge is the human's. (CLAUDE.md, docs/git-workflow.md)
- Commits are **minimalist, with NO `Co-Authored-By` line and no tool mentions** (overrides the harness default).
- This plan adds **tests + 1 fixture + 1 support file + one backward-compatible `fake-platform-client.js` extension** — **no production `src/` changes**.
- ⚠️ **The fake extension MUST stay backward compatible**: `contentByRefPath` is consulted *first*; when a `${ref}:${path}` key is absent, the existing `xmlByRef[ref]` behaviour is unchanged, so 4d-0/4d-1/4d-3 specs are unaffected after merge.
- **Characterization of shipped behaviour**: expected to PASS once written. A RED is a real finding — do not loosen, do not touch `src/`; investigate with superpowers:systematic-debugging. A confirmed genuine bug is the user's call (file a BUG and pin it, as BUG-0025 was handled in 4b).

**⚠️ FIXTURE NAME-COLLISION CHECK (mandatory first action):** `ls test/fixtures/ test/e2e/fixtures/`. The new fixture is `test/e2e/fixtures/handler-badges.bpmn` and the new support file `test/e2e/support/handler-open-capture.js` — confirmed absent. Do not reuse an existing name.

---

## Reference — verified facts (from `handler-navigator.js`, `handler-locator.js`, `bpmn-differ.js`, `fake-platform-client.js`, `styles.css`)

**Badge DOM (`#addBadge`):** an overlay `<div class="${cssClass}" title="${title}">&lt;/&gt;</div>`; selector `.djs-overlay.djs-overlay-note[data-overlay-id="…"] .handler-link`. `cssClass = diffType ? 'handler-link handler-link-<diffType>' : 'handler-link'`. Titles (`#BADGE_TITLES`, em dash U+2014):
- neutral (selection): `Open the handler code`
- `added`: `Handler added in this MR — open its diff`
- `changed`: `Handler changed in this MR — open its diff`
- `removed`: `Handler removed in this MR — open its diff`

**Changed-badge colours (`styles.css`, computed `background-color`):**
- `.handler-link-added` → **`rgb(136, 255, 136)`** (`#88ff88`)
- `.handler-link-changed` → **`rgb(136, 136, 255)`** (`#8888ff`)
- `.handler-link-removed` → **`rgb(255, 136, 136)`** (`#ff8888`)

**Handler key (`handlerKeyFromBusinessObject`):** the implementation holder is a nested `bpmn:MessageEventDefinition` if present, else the BO itself.
- external task: `impl.type === 'external' && impl.topic` → `topic:<topic>` (BPMN needs **both** `camunda:type="external"` and `camunda:topic="…"`).
- `camunda:delegateExpression="${bean}"` (single identifier) → `class:<CapitalizedBean>`.
- `camunda:class="com.foo.Bar"` → `class:Bar` (simple name).
- `camunda:expression` is ignored.

**Changed-handler scan (`bpmn-differ.js#loadChangedHandlers` → `HandlerLocator.findChangedHandlers`):** runs only when **`sourceRef && changeRequestId`** are set. Calls `findChangedHandlers(changeRequestId, sourceRef, targetRef)`:
- `prChangedFiles(changeRequestId)` → entries `{path, status}`. `extractHandlerFileChanges` keeps `.kt`/`.java` only → `{filePath, scanPath, diffType: status}`.
- per file: `scanRef = (status === 'removed') ? targetRef : sourceRef`; fetch `loadFileContent(rawFileUrl(scanRef, scanPath), false)`.
- `extractHandlerKeys(content)`: `@ExternalTaskSubscription("x")` → `topic:x`; `@WrapToExternalTask … class Foo` → `topic:foo`; every `class Foo` → `class:Foo`.
- `handlers.set(key, { filePath, diffType })`. The badge appears on whatever element carries that key, coloured by `diffType`. (The element is present in the shown diagram regardless of status here — status only drives colour.)
- The scan is async/background; `refreshChangedBadges` re-adds badges when it finishes → tests must auto-wait (`toBeVisible`).

**BUG-0016 dedup (`#getHandlerKey`):** `if (!elem || elem.labelTarget) return null;` — a bpmn-js external label shares its host's BO, so without this guard `refreshChangedBadges` (which iterates `getAll()`, labels included) would add a second badge on a **named** element. So a named changed handler must yield exactly **one** badge.

**Click (`#onOpenCode`):**
- changed (`#changedHandlers.has(key)`): `url = await mrFileDiffUrl(filePath, changeRequestId)`; then `if (url && !navigateOpenerFunc(url)) openUrlFunc(url)`. In Layer-2 `window.opener` is null → `navigateOpenerTab` returns `false` → `openUrlFunc(url) = window.open(url, '_blank')` fires. `mrFileDiffUrl = prDiffsUrl(id) + '#' + sha1(filePath)` → `http://localhost/mr/<id>/diffs#<40-hex>`.
- unchanged: `newTab = window.open('about:blank')` (sync), then `url = resolveLocation(key, ref) ? blobFileUrl(filePath, line, ref) : blobSearchPageUrl(term, ref)`; `newTab.location.href = url` (or `newTab.close()` if `url` null). `resolveLocation` uses `searchCode` (canned `searchHits`); `blobFileUrl(ref, path, line) → http://localhost/blob/<ref>/<path>#L<line>`; `searchPageUrl(term, ref) → http://localhost/search?term=<term>`. Shown ref on MR side = `sourceRef='mr-sha'`.

**Fake (current):** `rawFileUrl(ref, filePath)` ignores `filePath`, returns `data:` of `xmlByRef[ref]`. **Extension below adds `contentByRefPath` keyed `${ref}:${filePath}`, consulted first.** `searchCode` returns `searchHits`; the diagram XML still loads via `xmlByRef` (its path key is absent from `contentByRefPath`).

## File Structure

New:
- `test/e2e/fixtures/handler-badges.bpmn` — diagrammed process with an external-task ServiceTask (named), a delegateExpression ServiceTask, a camunda:class ServiceTask, and a message end event with a handler.
- `test/e2e/support/handler-open-capture.js` — page-side `window.open` capture (4d-2-owned).
- `test/e2e/differ-handler-badge-selection.spec.js` — Task 2.
- `test/e2e/differ-handler-badge-changed.spec.js` — Task 3.
- `test/e2e/differ-handler-badge-dedup.spec.js` — Task 4.
- `test/e2e/differ-handler-badge-click.spec.js` — Task 5.

Modified (additive): `test/e2e/support/fake-platform-client.js` (contentByRefPath), `test/e2e/support/boot-differ.js` (export `HANDLER_BADGES_BPMN`).

**Out of scope:** FEAT-0015 (deep handler change analysis — OPEN/unshipped); transitive dependency analysis; the real opener-tab navigation (no opener in Layer-2 — the fallback path is what's characterized).

---

### Task 1: Fake extension + fixture + capture helper + export

**Files:**
- Modify: `test/e2e/support/fake-platform-client.js`, `test/e2e/support/boot-differ.js`
- Create: `test/e2e/fixtures/handler-badges.bpmn`, `test/e2e/support/handler-open-capture.js`

**Interfaces:**
- Produces: `FakePlatformClient` honouring `contentByRefPath`; `HANDLER_BADGES_BPMN` export; `installHandlerOpenCapture(page)`, `getOpenCalls(page)`, `getNavigated(page)` from `./support/handler-open-capture`.

- [ ] **Step 1: Collision check**

Run: `ls test/fixtures/ test/e2e/fixtures/`
Expected: no `handler-badges.bpmn`, no `handler-open-capture.js`.

- [ ] **Step 2: Extend `fake-platform-client.js` (backward compatible)**

Change the constructor and `rawFileUrl`:

```js
    // { xmlByRef: { [ref]: xmlString }, searchHits: [...], changedFiles: [...],
    //   contentByRefPath: { [`${ref}:${path}`]: contentString } }
    constructor({ xmlByRef = {}, searchHits = [], changedFiles = [], contentByRefPath = {} } = {}) {
        this._xmlByRef = xmlByRef;
        this._searchHits = searchHits;
        this._changedFiles = changedFiles;
        this._contentByRefPath = contentByRefPath;
    }

    rawFileUrl(ref, filePath) {
        // Per-(ref,path) content wins (handler source files differ from the diagram
        // XML at the same ref); otherwise fall back to the by-ref diagram XML — an
        // unknown ref → '' (the differ's "file absent" path). Backward compatible:
        // with no contentByRefPath entry the original behaviour is unchanged.
        const pathKey = `${ref}:${filePath}`;
        if (Object.prototype.hasOwnProperty.call(this._contentByRefPath, pathKey)) {
            return 'data:application/xml,' + encodeURIComponent(this._contentByRefPath[pathKey]);
        }
        const xml = this._xmlByRef[ref];
        return 'data:application/xml,' + encodeURIComponent(xml || '');
    }
```

- [ ] **Step 3: Create `test/e2e/fixtures/handler-badges.bpmn`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_4" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_4" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:serviceTask id="ExternalTask" name="Score the Car" camunda:type="external" camunda:topic="scoreCar">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:serviceTask id="DelegateTask" camunda:delegateExpression="${notifyDelegate}">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:serviceTask id="ClassTask" camunda:class="com.example.PrepareDelegate">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="NotifyEnd" name="Notify User">
      <bpmn:incoming>Flow_4</bpmn:incoming>
      <bpmn:messageEventDefinition id="MsgDef_1" camunda:class="NotifyEventHandler" />
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="ExternalTask" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="ExternalTask" targetRef="DelegateTask" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="DelegateTask" targetRef="ClassTask" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="ClassTask" targetRef="NotifyEnd" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_4">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="142" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ExternalTask_di" bpmnElement="ExternalTask">
        <dc:Bounds x="240" y="120" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="DelegateTask_di" bpmnElement="DelegateTask">
        <dc:Bounds x="400" y="120" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ClassTask_di" bpmnElement="ClassTask">
        <dc:Bounds x="560" y="120" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="NotifyEnd_di" bpmnElement="NotifyEnd">
        <dc:Bounds x="722" y="142" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="160" />
        <di:waypoint x="240" y="160" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="340" y="160" />
        <di:waypoint x="400" y="160" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="500" y="160" />
        <di:waypoint x="560" y="160" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4">
        <di:waypoint x="660" y="160" />
        <di:waypoint x="722" y="160" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```

- [ ] **Step 4: Create `test/e2e/support/handler-open-capture.js`**

```js
'use strict';

// Page-side capture of handler-badge tab opening. Handler clicks call
// window.open(url) — either window.open('about:blank') then newTab.location.href =
// <resolved> for an unchanged handler, or window.open(mrDiffUrl) for a changed one
// (navigateOpenerTab returns false in Layer-2: no window.opener). After install:
//   window.__openCalls  — [url] passed to window.open(...)
//   window.__navigated  — [url] assigned to a returned tab's location.href
async function installHandlerOpenCapture(page) {
    await page.evaluate(() => {
        window.__openCalls = [];
        window.__navigated = [];
        window.open = function (url) {
            window.__openCalls.push(url);
            const tab = {};
            Object.defineProperty(tab, 'location', {
                value: { set href(v) { window.__navigated.push(v); }, get href() { return null; } }
            });
            tab.close = () => { window.__tabClosed = true; };
            return tab;
        };
    });
}

function getOpenCalls(page) {
    return page.evaluate(() => window.__openCalls);
}

function getNavigated(page) {
    return page.evaluate(() => window.__navigated);
}

module.exports = { installHandlerOpenCapture, getOpenCalls, getNavigated };
```

- [ ] **Step 5: Export the fixture from `boot-differ.js`**

Add `const HANDLER_BADGES_BPMN = read('test/e2e/fixtures/handler-badges.bpmn');` near the other e2e fixture reads, and add `HANDLER_BADGES_BPMN` to `module.exports`.

- [ ] **Step 6: Sanity boot + commit**

Run: `npx playwright test test/e2e/differ-boot.spec.js`
Expected: PASS (the fake change is additive — existing boot still green).

```bash
git add test/e2e/support/fake-platform-client.js test/e2e/support/boot-differ.js test/e2e/fixtures/handler-badges.bpmn test/e2e/support/handler-open-capture.js
git commit -m "test(e2e): fake contentByRefPath + handler-badges fixture + open capture (Layer-2 4d-2)"
```

---

### Task 2: Neutral selection badge (service task + message event FEAT-0018)

**Files:**
- Create: `test/e2e/differ-handler-badge-selection.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `HANDLER_BADGES_BPMN` from `./support/boot-differ`.

- [ ] **Step 1: Write the file with two tests**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, HANDLER_BADGES_BPMN
} = require('./support/boot-differ');

// Without a changeRequestId no permanent (changed) badges are computed, so a
// service task with a recognised handler shows the neutral on-selection badge:
// class exactly "handler-link" (no colour suffix), title "Open the handler code".
test('shows the neutral handler badge on a selected service task', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),   // no changeRequestId → no changed handlers
        fixtures: { xmlByRef: { 'mr-sha': HANDLER_BADGES_BPMN, 'base-sha': HANDLER_BADGES_BPMN } }
    });

    await page.locator('svg .djs-element[data-element-id="ClassTask"]').click();

    const badge = page.locator('.djs-overlay-note .handler-link');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', 'Open the handler code');
    await expect(badge).not.toHaveClass(/handler-link-(added|changed|removed)/);
});

// FEAT-0018: a message end event whose nested MessageEventDefinition carries a
// handler (camunda:class) also gets the neutral badge on selection.
test('shows the neutral handler badge on a message end event (FEAT-0018)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': HANDLER_BADGES_BPMN, 'base-sha': HANDLER_BADGES_BPMN } }
    });

    await page.locator('svg .djs-element[data-element-id="NotifyEnd"]').click();

    const badge = page.locator('.djs-overlay-note .handler-link');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', 'Open the handler code');
});
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test test/e2e/differ-handler-badge-selection.spec.js`
Expected: PASS (both). If the badge does not appear, confirm the external/delegate/class attributes resolve to a handler key (camunda moddle is wired via `defaultBpmnParams().camundaBpmnModdle`). A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-handler-badge-selection.spec.js
git commit -m "test(e2e): cover neutral handler badge on selection + message event (FEAT-0018/0003/0004, Layer-2 4d-2)"
```

---

### Task 3: Permanent changed badges — added/changed/removed colours + titles

**Files:**
- Create: `test/e2e/differ-handler-badge-changed.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `HANDLER_BADGES_BPMN` from `./support/boot-differ`.

- [ ] **Step 1: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, HANDLER_BADGES_BPMN
} = require('./support/boot-differ');

const GREEN = 'rgb(136, 255, 136)';   // added
const BLUE = 'rgb(136, 136, 255)';    // changed
const RED = 'rgb(255, 136, 136)';     // removed

// With a changeRequestId set, findChangedHandlers fetches each changed handler
// source file and parses its keys. A topic handler whose file is "added" → green;
// a class handler whose file is "changed" → blue; a delegate handler whose file is
// "removed" → red (scanned at the target ref). The matching diagram element gets a
// permanent badge coloured by the file's status, with a per-status title.
test('paints permanent changed-handler badges coloured by status', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ changeRequestId: 42 }),
        fixtures: {
            xmlByRef: { 'mr-sha': HANDLER_BADGES_BPMN, 'base-sha': HANDLER_BADGES_BPMN },
            changedFiles: [
                { path: 'src/ScoreCarTask.kt', status: 'added' },
                { path: 'src/PrepareDelegate.kt', status: 'changed' },
                { path: 'src/NotifyDelegate.kt', status: 'removed' }
            ],
            contentByRefPath: {
                // added/changed scanned at sourceRef (mr-sha); removed at targetRef (base-sha).
                'mr-sha:src/ScoreCarTask.kt': '@ExternalTaskSubscription("scoreCar")\nclass ScoreCarTask',
                'mr-sha:src/PrepareDelegate.kt': 'class PrepareDelegate',
                'base-sha:src/NotifyDelegate.kt': 'class NotifyDelegate'
            }
        }
    });

    const added = page.locator('.handler-link-added');
    await expect(added).toBeVisible();
    await expect(added).toHaveCSS('background-color', GREEN);
    await expect(added).toHaveAttribute('title', 'Handler added in this MR — open its diff');

    const changed = page.locator('.handler-link-changed');
    await expect(changed).toBeVisible();
    await expect(changed).toHaveCSS('background-color', BLUE);
    await expect(changed).toHaveAttribute('title', 'Handler changed in this MR — open its diff');

    const removed = page.locator('.handler-link-removed');
    await expect(removed).toBeVisible();
    await expect(removed).toHaveCSS('background-color', RED);
    await expect(removed).toHaveAttribute('title', 'Handler removed in this MR — open its diff');
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test test/e2e/differ-handler-badge-changed.spec.js`
Expected: PASS. The scan is async — `toBeVisible` auto-waits for the post-scan `refreshChangedBadges`. A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-handler-badge-changed.spec.js
git commit -m "test(e2e): cover permanent changed-handler badge colours + titles (FEAT-0003/0004, Layer-2 4d-2)"
```

---

### Task 4: BUG-0016 — no duplicate badge on a labelled element

**Files:**
- Create: `test/e2e/differ-handler-badge-dedup.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `HANDLER_BADGES_BPMN` from `./support/boot-differ`.

- [ ] **Step 1: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, HANDLER_BADGES_BPMN
} = require('./support/boot-differ');

// BUG-0016: "ExternalTask" is NAMED, so bpmn-js creates a separate label element
// sharing the task's businessObject. refreshChangedBadges iterates every element
// (labels included); without the labelTarget guard the named task would get TWO
// badges (host + label). Only the external-task handler is changed here, so exactly
// ONE handler badge must exist.
test('does not duplicate the badge on a labelled changed handler', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ changeRequestId: 42 }),
        fixtures: {
            xmlByRef: { 'mr-sha': HANDLER_BADGES_BPMN, 'base-sha': HANDLER_BADGES_BPMN },
            changedFiles: [{ path: 'src/ScoreCarTask.kt', status: 'added' }],
            contentByRefPath: {
                'mr-sha:src/ScoreCarTask.kt': '@ExternalTaskSubscription("scoreCar")\nclass ScoreCarTask'
            }
        }
    });

    // The added badge appears...
    await expect(page.locator('.handler-link-added')).toBeVisible();
    // ...exactly once — the named element's label did not get a second one.
    await expect(page.locator('.handler-link')).toHaveCount(1);
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test test/e2e/differ-handler-badge-dedup.spec.js`
Expected: PASS. A count of 2 would mean the BUG-0016 guard regressed — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-handler-badge-dedup.spec.js
git commit -m "test(e2e): pin handler-badge dedup on labelled element (BUG-0016, Layer-2 4d-2)"
```

---

### Task 5: Click behaviour — changed → MR diff; unchanged → blob / search fallback

**Files:**
- Create: `test/e2e/differ-handler-badge-click.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `HANDLER_BADGES_BPMN` from `./support/boot-differ`; `installHandlerOpenCapture`, `getOpenCalls`, `getNavigated` from `./support/handler-open-capture`.

- [ ] **Step 1: Write the file with three tests**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, HANDLER_BADGES_BPMN
} = require('./support/boot-differ');
const {
    installHandlerOpenCapture, getOpenCalls, getNavigated
} = require('./support/handler-open-capture');

// Clicking an UNCHANGED handler badge opens a blank tab synchronously, then
// navigates it to the handler file's blob URL at the shown ref (mr-sha) once
// resolveLocation (via searchCode) returns the hit.
test('unchanged handler click opens blank tab then navigates to the blob URL', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),   // no changeRequestId → ClassTask is "unchanged"
        fixtures: {
            xmlByRef: { 'mr-sha': HANDLER_BADGES_BPMN, 'base-sha': HANDLER_BADGES_BPMN },
            searchHits: [{ path: 'src/PrepareDelegate.kt', line: 5, snippet: 'class PrepareDelegate' }]
        }
    });
    await installHandlerOpenCapture(page);

    await page.locator('svg .djs-element[data-element-id="ClassTask"]').click();
    await page.locator('.djs-overlay-note .handler-link').click();

    await expect.poll(async () => await getNavigated(page)).toEqual(
        ['http://localhost/blob/mr-sha/src/PrepareDelegate.kt#L5']
    );
    expect(await getOpenCalls(page)).toEqual(['about:blank']);
});

// When the handler source cannot be located (no search hits), the blank tab is
// navigated to the repo search page for the handler term instead.
test('unchanged handler click falls back to the repo search page', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: {
            xmlByRef: { 'mr-sha': HANDLER_BADGES_BPMN, 'base-sha': HANDLER_BADGES_BPMN },
            searchHits: []
        }
    });
    await installHandlerOpenCapture(page);

    await page.locator('svg .djs-element[data-element-id="ClassTask"]').click();
    await page.locator('.djs-overlay-note .handler-link').click();

    await expect.poll(async () => await getNavigated(page)).toEqual(
        ['http://localhost/search?term=PrepareDelegate']
    );
});

// Clicking a CHANGED handler badge opens its MR diff. In Layer-2 there is no
// window.opener, so navigateOpenerTab returns false and the differ falls back to
// window.open(mrDiffUrl) — the MR diffs page anchored by the file-path SHA-1.
test('changed handler click opens the MR diff (opener-tab fallback)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ changeRequestId: 42 }),
        fixtures: {
            xmlByRef: { 'mr-sha': HANDLER_BADGES_BPMN, 'base-sha': HANDLER_BADGES_BPMN },
            changedFiles: [{ path: 'src/ScoreCarTask.kt', status: 'added' }],
            contentByRefPath: {
                'mr-sha:src/ScoreCarTask.kt': '@ExternalTaskSubscription("scoreCar")\nclass ScoreCarTask'
            }
        }
    });
    await installHandlerOpenCapture(page);

    const badge = page.locator('.handler-link-added');
    await expect(badge).toBeVisible();
    await badge.click();

    await expect.poll(async () => (await getOpenCalls(page)).length).toBe(1);
    const [url] = await getOpenCalls(page);
    expect(url).toMatch(/^http:\/\/localhost\/mr\/42\/diffs#[0-9a-f]{40}$/);
});
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test test/e2e/differ-handler-badge-click.spec.js`
Expected: PASS (all three). A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-handler-badge-click.spec.js
git commit -m "test(e2e): cover handler-badge click flows changed/unchanged/fallback (BUG-0013, Layer-2 4d-2)"
```

---

## Finalize 4d-2

- [ ] **Run the full suites green**

Run: `npm test` → unit suite unchanged & green.
Run: `npm run test:e2e` → all e2e specs green (existing set + 8 new tests across 4 new files; the additive fake change does not regress any existing spec).

- [ ] **Push + MR** (branch `feature/e2e-phase4d2`, branched from fresh `origin/master`)

Use the `mr` skill (`--remove-source-branch`). Merge is the human's. Do not push with a red suite.

- [ ] **Update the auto-memory** `layer2-e2e-coverage.md` with a "Phase 4d-2 SHIPPED" note: neutral + coloured handler badges (FEAT-0003/0004/0018), the `contentByRefPath` fake extension (and WHY — handler source ≠ diagram XML at the same ref), the BUG-0016 dedup pin, the click-flow capture (`navigateOpenerTab`→false→`window.open` fallback; about:blank-then-`location.href`), the `handler-badges.bpmn` fixture, and the suite count.
