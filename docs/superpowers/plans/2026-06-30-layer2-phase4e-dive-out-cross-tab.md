# Layer-2 Phase 4e: Dive-out & Cross-tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Characterize, at Layer-2, the BPMN/DMN differ's **dive-out** navigation (FEAT-0023, gap-analysis Section J) and **cross-tab no-duplicate** reuse (BUG-0017, Section K): the `⤴` dive-out button (fast opener focus + reopen fallback), the `▾` caller menu (spinner → list → "no callers" → error+search-link, the "came-from" `↩` mark and ordering), the `selectCalledProcessIds` auto-select on a freshly opened caller, the DMN→BPMN dive-out direction, and the `BroadcastChannel`+identityKey registry that brings an already-open diagram tab to the front instead of opening a duplicate.

**Architecture:** Each test boots the real `BpmnDiffer`/`DmnDiffer` via `bootBpmnDiffer`/`bootDmnDiffer` with a `FakePlatformClient`, then drives the toolbar `⤴`/`▾` controls or a dive-in badge. Two feasibility seams (both empirically confirmed by a throwaway spike — see "Feasibility" below):
- **Opener paths** (`focusOpenerAndClose`) run by installing a **fake same-origin `window.opener`** in the page (assigning `window.opener` to an object sticks); a harness page otherwise has `window.opener === null`.
- **Cross-tab** runs by booting **two real `context.newPage()` pages** sharing the one real same-origin `BroadcastChannel` — the "who-has/i-have" registry delivers across them (spike: ~0 ms).

A nested/reused differ tab still **cannot render** in Layer-2 (its `main()` calls `createPlatformClient('fake')`, which throws), so — exactly as in Phase 4d — every tab-opening primitive is **stubbed and the resolved decision is asserted** (`openDiffer` params/msgId, the focus-by-name `window.open('', name)` call, `window.close()`), never a real second differ. **No `src/` change. No new fixtures. No edits to existing files.**

**Tech Stack:** Vanilla JS (ES6+), `@playwright/test`, the existing Layer-2 harness.

## Global Constraints

- Vanilla JS (ES6+), no build step, **no new runtime dependencies**; `@playwright/test` is the agreed dev dependency. (CLAUDE.md)
- E2E files are named `*.spec.js` — **never** `*.test.js`. (docs/testing.md)
- `npm test` stays unit-only; e2e is the separate `npm run test:e2e`. (docs/testing.md)
- All code comments and docs are in **English only**. (CLAUDE.md)
- **master is protected** — work on `feature/e2e-phase4e`, branched from a freshly fetched `origin/master`; completing = push + MR via skill `mr` (`--remove-source-branch`) after green tests. Merge is the human's. (CLAUDE.md, docs/git-workflow.md)
- Commits are **minimalist, with NO `Co-Authored-By` line and no tool mentions** (overrides the harness default).
- This plan adds **tests + 1 support file only** — **no production `src/` changes, no new fixtures, no edits to `boot-differ.js`**.
- **Characterization of shipped behaviour**: expected to PASS once written. A RED is a real finding — do not loosen, do not touch `src/`; investigate with superpowers:systematic-debugging. A red that exposes a genuine bug is the user's call (surface options; if confirmed, file a BUG and pin it, as BUG-0025 was handled in 4b).
- ⚠️ Run every e2e step with **`CI=1`** so Playwright starts its own hermetic server on port 4173 instead of reusing a stale one (`reuseExistingServer: !CI`). The static server is single-port; a second concurrent run errors loudly rather than serving the wrong tree.

**⚠️ FIXTURE/FILE NAME-COLLISION CHECK (mandatory first action):** `ls test/e2e/support/ test/e2e/fixtures/`. The one new file is `test/e2e/support/dive-out-capture.js` — confirm absent (distinct from the existing `dive-in-capture.js`/`handler-open-capture.js`/`correlation-open-capture.js`). All diagram inputs are **reused** existing fixtures — create none.

---

## Feasibility (resolved by spike — informational; nothing to do here)

A throwaway spec booted real differs and probed the two open questions (then was deleted, not committed). Verdicts now baked into this plan:
- **Cross-page `BroadcastChannel`** delivers across two `context.newPage()` pages: a "who-has" for a registered key returned focus in **0 ms**; an unregistered key returned `false` after the **~150 ms** `QUERY_TIMEOUT_MS`. → **K (BUG-0017) is Layer-2.**
- **`window.opener = {fake}` sticks** (own-property override of the lenient setter); `focusOpenerAndClose` then takes its present-branch (`window.open('', OPENER_TAB_TARGET)` + `window.close()`). A real `window.open` popup also yields a usable opener, but the fake is lighter and is what this plan uses. → **J opener paths are Layer-2 via a test-support stub; no `src/` seam.**
- **FEAT-0025** (re-highlight the call site when a tab is *reused*) has `status: open` and **no `src/` implementation** — `focusExistingDifferTab` returns a boolean, the early-return in `#openDifferForFile` posts nothing to the reused tab. There is no shipped behaviour to characterize → **explicitly out of scope** until FEAT-0025 ships.

---

## Reference — verified facts (from `back-navigator.js`, `caller-locator.js`, `decision-caller-locator.js`, `differ-tab-navigator.js`, `differ-params.js`, `bpmn-differ.js`, `dmn-differ.js`, the views, `fake-platform-client.js`)

**Back-navigation DOM (`BackNavigator.createElement`, mounted by each view's `build()`/`setBackNavigator`):** a `div.differ-btn-group.differ-back-group` always rendered (both orchestrators always pass a caller locator, so `createElement` never returns null). Inside:
- the **dive-out button** — `<button>` (class `BpmnDifferView.BTN_CLASS + ' differ-btn differ-icon-btn'`), `textContent = '⤴'` (U+2934), `title = 'Dive out to a calling diagram'` or, when `divedInFrom` is set, `'Dive out to a calling diagram (<fileName>)'`. Click: if `divedInFrom` → `onDiveOutToOpener()`; else → toggle the menu.
- the **caret button** — `<button class="… differ-icon-btn differ-back-caret">`, `textContent = '▾'` (U+25BE), `title = 'Diagrams that call this one'`. Click: toggle the menu.
- the **menu** — `div.differ-back-menu` (`hidden` until opened). States, each replacing the menu contents:
  - loading: one `div.differ-back-menu-message` whose `innerHTML` is `'<span class="differ-spinner-inline"></span> Searching for callers…'`.
  - list: one `button.differ-back-menu-item` per caller (`title = caller.filePath`), each holding a `span.differ-back-menu-name` (`textContent = caller.fileName`). The "came-from" caller (`caller.filePath === divedInFrom.filePath`) gets class `differ-back-menu-item-came-from`, an extra `span.differ-back-menu-mark` (`textContent = '↩ came from here'`, U+21A9), and is ordered **first**. Click: came-from row → `onDiveOutToOpener()`; other row → `onOpenCaller(filePath, fileName)`.
  - empty: one `div.differ-back-menu-message` `textContent = 'No diagram calls this one'`.
  - error: one `div.differ-back-menu-message` `textContent = "Couldn't check the calling diagrams."` plus (when a process/decision id exists) an `a.differ-back-menu-link` `textContent = 'Search in GitLab'`, `href = '#'`; click → `preventDefault()` + `onOpenUrl(callerLocator.blobSearchPageUrl(id, ref))`.

**Orchestrator wiring (BPMN `bpmn-differ.js`, DMN `dmn-differ.js`):**
- `onDiveOutToOpener: () => this.#diveOutToOpener()` → `if (this.#tabNavigator.focusOpenerAndClose()) return;` else, when `divedInFrom`, `this.#diveOutToCallerDiffer(divedInFrom.filePath, divedInFrom.fileName)`.
- `onOpenCaller: (filePath, fileName) => this.#diveOutToCallerDiffer(filePath, fileName)` → `this.#openDifferForFile(filePath, fileName, { selectCalledProcessIds: this.#getCurrentProcessIds() })` (BPMN) / `{ selectCalledProcessIds: this.#getCurrentDecisionIds() }` (DMN).
- `#openDifferForFile(filePath, fileName, extra)`: `identityKey = DifferParams.identityKeyFor(this.#params, filePath)`; `if (await this.#tabNavigator.focusExistingDifferTab(identityKey)) return;` else `openNestedDiffer(toNestedDifferParams(filePath, fileName, extra), fileName)`.
- `toNestedDifferParams(filePath, fileName, extra)` → `{ platform, sourceRef, sourceLabel, changeRequestId, targetRef, targetLabel, filePath, fileName, camundaBpmnModdle, ...extra }`. Dive-out `extra` is `{ selectCalledProcessIds }` only — **no `divedInFrom` key** (so `params.divedInFrom` is `undefined` on a dive-out open).
- `openNestedDiffer` computes `msgId = /\.dmn$/i.test(fileName) ? DmnDiffer.MSG_ID : BpmnDiffer.MSG_ID` and calls the global `openDiffer(params, null, msgId, …)`.
- **Auto-select consumer** — `BpmnDiffer.#applyInitialCallActivitySelection()` runs once during init (`bpmn-differ.js:225`): reads `this.#params.selectCalledProcessIds`; finds the first element that is a `bpmn:CallActivity` whose `businessObject.calledElement ∈ ids` **or** a `bpmn:BusinessRuleTask` whose `businessObject.decisionRef ∈ ids`; `scrollToElement` + selects it (a retry loop re-asserts the panel). Selecting a Call Activity / Business Rule Task makes the **dive-in badge overlay** (`.dive-in-call-activity`) appear — the user-visible "call site highlighted".

**`DifferTabNavigator` (shared):** `OPENER_TAB_TARGET = 'gl-bpmn-diff-opener-tab'`; `TAB_NAME_PREFIX = 'gl-bpmn-diff-tab:'`; `QUERY_TIMEOUT_MS = 150`. `registerTab(identityKey)` (run during `show()`): sets `window.name = TAB_NAME_PREFIX + identityKey` and joins the `BroadcastChannel('gl-bpmn-diff-tab-registry')`, answering `who-has` with `i-have`; a `pagehide` listener closes the channel (so a closed tab is never matched). `focusExistingDifferTab(identityKey)`: returns `false` if no channel; else queries the channel and, on a positive answer, returns `#focusByName(TAB_NAME_PREFIX + identityKey)` which does `window.open('', name)`; on no answer resolves `false` after `QUERY_TIMEOUT_MS`. `focusOpenerAndClose()`: `false` when `!window.opener || window.opener.closed`; else `#focusTab(opener)` (`opener.name = OPENER_TAB_TARGET; window.open('', OPENER_TAB_TARGET); opener.name = prev`) then `window.close()`, returns `true`.

**`identityKeyFor(params, filePath)`** = `[params.platform.projectUrl, params.changeRequestId || '', params.sourceRef || '', params.targetRef, filePath].join('\n')`. With `defaultBpmnParams`: `['http://localhost/p', '', 'mr-sha', 'base-sha', <filePath>].join('\n')`.

**Caller locators:** `CallerLocator.resolveCallers(processIds, ref, selfFilePath)` calls `client.searchCode(ref, 'calledElement="<id>"')` per id, keeps `.bpmn` hits (`CallActivityLocator.isBpmnFile`), drops `selfFilePath`, dedupes by path; **throws** on a search error (distinguishes "no callers" `[]` from "couldn't check"). `blobSearchPageUrl(id, ref) = client.searchPageUrl('calledElement="<id>"', ref)`. `DecisionCallerLocator` is identical but searches `'decisionRef="<id>"'` and `blobSearchPageUrl` uses `'decisionRef="<id>"'`.

**`FakePlatformClient` (test/e2e/support):** `searchCode(ref, term)` ignores both args and returns the canned `searchHits` (so hit `path`/`snippet` fully control resolution); `searchPageUrl(term, ref) → 'http://localhost/search?term=' + encodeURIComponent(term)`; `rawFileUrl` → a `data:` URL of `xmlByRef[ref]`. To simulate a **search failure**, patch the prototype in-spec (`FakePlatformClient.prototype.searchCode = async () => { throw new Error('search disabled'); }`); to make the **spinner observable**, slow it (`await new Promise(r => setTimeout(r, 250))` before the original).

**Reused fixtures (no new ones):**
- `test/e2e/fixtures/call-activity.bpmn` (`CALL_ACTIVITY_BPMN`): `Process_2`, `callActivity id="CallActivity_1" calledElement="Sub_Process"`.
- `test/e2e/fixtures/business-rule-task.bpmn` (`BUSINESS_RULE_TASK_BPMN`): `Process_3`, `businessRuleTask id="BusinessRuleTask_1" camunda:decisionRef="My_Decision"`.
- `test/fixtures/base.dmn` (`BASE_DMN`): `decision id="Decision_1"`.
All already exported from `boot-differ.js` (verified) — **no `boot-differ.js` edit needed**.

## File Structure

New:
- `test/e2e/support/dive-out-capture.js` — page-side capture of `window.openDiffer` + `window.open(url,name)` + `window.close()`, with an optional fake `window.opener` (4e-owned; no shared-file edit).
- `test/e2e/differ-dive-out-opener.spec.js` — J1 `⤴` fast focus, J2 `⤴` reopen fallback, J7 came-from row reuse.
- `test/e2e/differ-dive-out-menu.spec.js` — J3 spinner→list+ordering, J4 empty, J5 error+search-link, J6 open caller.
- `test/e2e/differ-dive-out-autoselect.spec.js` — J8 Call Activity auto-select, J9 Business Rule Task auto-select.
- `test/e2e/differ-dive-out-dmn.spec.js` — J10 DMN→BPMN dive-out direction.
- `test/e2e/differ-cross-tab-dedup.spec.js` — K1 reuse-no-duplicate, K2 fresh-open control, K3 closed-tab-not-matched.

Modified: **none.**

**Out of scope:** FEAT-0025 (re-highlight on reuse — unimplemented); the actual rendering of a nested/reused tab (impossible with the fake client); the `navigateOpenerTab` *present*-branch (handler nav, gap-analysis Section H — the new opener seam would unlock it as a future 4d-2 follow-up); self-no-echo & concurrent-query registry semantics (already unit-tested in `test/differ/shared/differ-tab-navigator.test.js`).

---

### Task 1: Capture helper + sanity

**Files:**
- Create: `test/e2e/support/dive-out-capture.js`

**Interfaces:**
- Produces: `installCapture(page, { opener } = {})`, `getOpenDifferCalls(page)`, `getOpenCalls(page)`, `getCloseCount(page)` from `./support/dive-out-capture`.
  - `installCapture` sets, in the page: `window.__openDifferCalls = []`, `window.__openCalls = []`, `window.__closeCount = 0`; stubs `window.openDiffer`/`window.open`/`window.close`; and, when `opener: true`, assigns a fake `window.opener`.
  - `getOpenDifferCalls` → `Promise<[{ params, msgId }]>`; `getOpenCalls` → `Promise<[[url, name], …]>`; `getCloseCount` → `Promise<number>`.

- [ ] **Step 1: Collision check**

Run: `ls test/e2e/support/ test/e2e/fixtures/`
Expected: no `dive-out-capture.js`; all `.bpmn`/`.dmn` inputs this plan names already exist.

- [ ] **Step 2: Create `test/e2e/support/dive-out-capture.js`**

```js
'use strict';

// Page-side capture for the dive-out (FEAT-0023) and cross-tab (BUG-0017) flows.
// A nested/reused differ tab cannot render in Layer-2 (its main() calls
// createPlatformClient('fake'), which throws), so we stub the tab-management
// primitives and assert the decisions the orchestrator makes:
//   window.openDiffer       -> window.__openDifferCalls: [{ params, msgId }]
//   window.open(url, name)  -> window.__openCalls:        [[url, name], ...]
//   window.close()          -> window.__closeCount
// With { opener: true } we also install a fake same-origin window.opener so the
// opener-present branch of focusOpenerAndClose runs (assigning window.opener to an
// object sticks — spike-confirmed). openDiffer is a top-level function in utils.js,
// so reassigning window.openDiffer shadows the binding the bare openDiffer(...) call
// resolves at call time.
async function installCapture(page, { opener = false } = {}) {
    await page.evaluate(({ opener }) => {
        window.__openDifferCalls = [];
        window.__openCalls = [];
        window.__closeCount = 0;
        if (opener) {
            // Stand-in for the tab that opened this one. name is read+restored by the
            // named-target focus trick; closed:false so focusOpenerAndClose proceeds.
            window.opener = { closed: false, name: '', focus() {} };
        }
        window.openDiffer = async function (params, extParams, msgId) {
            window.__openDifferCalls.push({ params, msgId });
            return true;
        };
        window.open = function (url, name) {
            window.__openCalls.push([url, name]);
            return null;
        };
        window.close = function () {
            window.__closeCount += 1;
        };
    }, { opener });
}

function getOpenDifferCalls(page) {
    return page.evaluate(() => window.__openDifferCalls);
}

function getOpenCalls(page) {
    return page.evaluate(() => window.__openCalls);
}

function getCloseCount(page) {
    return page.evaluate(() => window.__closeCount);
}

module.exports = { installCapture, getOpenDifferCalls, getOpenCalls, getCloseCount };
```

- [ ] **Step 3: Sanity boot + commit**

Run: `CI=1 npx playwright test test/e2e/differ-dive-in.spec.js`
Expected: PASS (an unrelated existing spec; confirms the harness is intact and the new support file does not break collection).

```bash
git add test/e2e/support/dive-out-capture.js
git commit -m "test(e2e): add dive-out/cross-tab capture helper (Layer-2 4e)"
```

---

### Task 2: Dive-out `⤴` button + came-from reuse (J1, J2, J7)

**Files:**
- Create: `test/e2e/differ-dive-out-opener.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `CALL_ACTIVITY_BPMN` from `./support/boot-differ`; `installCapture`, `getOpenDifferCalls`, `getOpenCalls`, `getCloseCount` from `./support/dive-out-capture`.

- [ ] **Step 1: Write the file with three tests**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, CALL_ACTIVITY_BPMN
} = require('./support/boot-differ');
const {
    installCapture, getOpenDifferCalls, getOpenCalls, getCloseCount
} = require('./support/dive-out-capture');

const CA_FIXTURES = { xmlByRef: { 'mr-sha': CALL_ACTIVITY_BPMN, 'base-sha': CALL_ACTIVITY_BPMN } };
const diveOutButton = (page) => page.locator('.differ-back-group button:not(.differ-back-caret)');
const caret = (page) => page.locator('.differ-back-caret');

// J1: arrived here by diving in (divedInFrom set) and the opener tab is still open,
// so the dive-out arrow jumps straight to it: focus the opener by its transient
// name (empty-URL open, no reload) and close this tab. No new differ is opened.
test('dive-out arrow focuses the opener tab and closes this one (divedInFrom + opener)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ divedInFrom: { filePath: 'parent.bpmn', fileName: 'parent.bpmn' } }),
        fixtures: CA_FIXTURES
    });
    await installCapture(page, { opener: true });
    const openerTarget = await page.evaluate(() => DifferTabNavigator.OPENER_TAB_TARGET);

    const button = diveOutButton(page);
    await expect(button).toHaveText('⤴');
    await expect(button).toHaveAttribute('title', 'Dive out to a calling diagram (parent.bpmn)');
    await button.click();

    await expect.poll(() => getCloseCount(page)).toBe(1);
    expect(await getOpenCalls(page)).toContainEqual(['', openerTarget]);
    expect(await getOpenDifferCalls(page)).toEqual([]); // no duplicate/new differ tab
});

// J2: arrived by diving in, but the opener tab is gone (no window.opener in this
// page). The arrow falls back to REOPENING the caller as a fresh differ, asking it
// to auto-select the call site to the diagram we came from (selectCalledProcessIds =
// this diagram's process ids). It carries no divedInFrom (that is the dive-IN hint).
test('dive-out arrow reopens the caller when the opener tab is gone', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ divedInFrom: { filePath: 'parent.bpmn', fileName: 'parent.bpmn' } }),
        fixtures: CA_FIXTURES
    });
    await installCapture(page); // no fake opener -> window.opener is null

    await diveOutButton(page).click();

    await expect.poll(async () => (await getOpenDifferCalls(page)).length).toBe(1);
    const [call] = await getOpenDifferCalls(page);
    expect(call.params.filePath).toBe('parent.bpmn');
    expect(call.params.fileName).toBe('parent.bpmn');
    expect(call.params.selectCalledProcessIds).toEqual(['Process_2']);
    expect(call.params.divedInFrom).toBeUndefined();
    expect(call.msgId).toBe(await page.evaluate(() => BpmnDiffer.MSG_ID));
    expect(await getCloseCount(page)).toBe(0);
});

// J7: opening the caller MENU and clicking the "came from here" row reuses the open
// opener tab (same fast path as the arrow) rather than opening it afresh.
test('clicking the came-from caller row reuses the opener tab', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ divedInFrom: { filePath: 'parent.bpmn', fileName: 'parent.bpmn' } }),
        fixtures: { ...CA_FIXTURES, searchHits: [{ path: 'parent.bpmn', line: 1, snippet: 'calledElement="Process_2"' }] }
    });
    await installCapture(page, { opener: true });
    const openerTarget = await page.evaluate(() => DifferTabNavigator.OPENER_TAB_TARGET);

    await caret(page).click();
    const cameFromRow = page.locator('.differ-back-menu-item-came-from');
    await expect(cameFromRow).toBeVisible();
    await expect(cameFromRow.locator('.differ-back-menu-name')).toHaveText('parent.bpmn');
    await expect(cameFromRow.locator('.differ-back-menu-mark')).toHaveText('↩ came from here');
    await cameFromRow.click();

    await expect.poll(() => getCloseCount(page)).toBe(1);
    expect(await getOpenCalls(page)).toContainEqual(['', openerTarget]);
    expect(await getOpenDifferCalls(page)).toEqual([]);
});
```

- [ ] **Step 2: Run the tests**

Run: `CI=1 npx playwright test test/e2e/differ-dive-out-opener.spec.js`
Expected: PASS (all three). A red is a real finding — investigate with systematic-debugging, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-dive-out-opener.spec.js
git commit -m "test(e2e): cover dive-out arrow focus/fallback/came-from reuse (FEAT-0023, Layer-2 4e)"
```

---

### Task 3: Dive-out caller menu states (J3, J4, J5, J6)

**Files:**
- Create: `test/e2e/differ-dive-out-menu.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `CALL_ACTIVITY_BPMN` from `./support/boot-differ`; `installCapture`, `getOpenDifferCalls`, `getOpenCalls` from `./support/dive-out-capture`.

- [ ] **Step 1: Write the file with four tests**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, CALL_ACTIVITY_BPMN
} = require('./support/boot-differ');
const {
    installCapture, getOpenDifferCalls, getOpenCalls
} = require('./support/dive-out-capture');

const CA_FIXTURES = { xmlByRef: { 'mr-sha': CALL_ACTIVITY_BPMN, 'base-sha': CALL_ACTIVITY_BPMN } };
const caret = (page) => page.locator('.differ-back-caret');

// J3: opening the caret menu shows a spinner while CallerLocator searches, then the
// list of callers. The diagram we came from is marked and ordered first, even though
// it is second in the raw search hits. We slow searchCode so the spinner is
// deterministically observable.
test('caller menu shows a spinner then the ordered caller list (came-from first)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ divedInFrom: { filePath: 'caller-a.bpmn', fileName: 'caller-a.bpmn' } }),
        fixtures: {
            ...CA_FIXTURES,
            searchHits: [
                { path: 'caller-b.bpmn', line: 1, snippet: 'calledElement="Process_2"' },
                { path: 'caller-a.bpmn', line: 1, snippet: 'calledElement="Process_2"' }
            ]
        }
    });
    await installCapture(page);
    await page.evaluate((ms) => {
        const orig = FakePlatformClient.prototype.searchCode;
        FakePlatformClient.prototype.searchCode = async function (...args) {
            await new Promise((r) => setTimeout(r, ms));
            return orig.apply(this, args);
        };
    }, 250);

    await caret(page).click();

    // While resolving: spinner row.
    await expect(page.locator('.differ-back-menu .differ-spinner-inline')).toBeVisible();
    await expect(page.locator('.differ-back-menu-message')).toContainText('Searching for callers');

    // Resolved: two rows, came-from (caller-a) first and marked.
    const items = page.locator('.differ-back-menu-item');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0).locator('.differ-back-menu-name')).toHaveText('caller-a.bpmn');
    await expect(items.nth(0)).toHaveClass(/differ-back-menu-item-came-from/);
    await expect(items.nth(1).locator('.differ-back-menu-name')).toHaveText('caller-b.bpmn');
    await expect(items.nth(1)).not.toHaveClass(/differ-back-menu-item-came-from/);
});

// J4: a root diagram (nothing calls it) -> empty search result -> "No diagram calls
// this one", distinct from the error state below.
test('caller menu shows "no callers" for a root diagram', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: defaultBpmnParams(), fixtures: { ...CA_FIXTURES, searchHits: [] } });
    await installCapture(page);

    await caret(page).click();

    await expect(page.locator('.differ-back-menu-message')).toHaveText('No diagram calls this one');
    await expect(page.locator('.differ-back-menu-item')).toHaveCount(0);
});

// J5: a failing search (CallerLocator throws) -> "Couldn't check…" plus a "Search in
// GitLab" link; clicking it opens the human search page for calledElement="<id>".
test('caller menu shows an error and a GitLab search link when the search fails', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: defaultBpmnParams(), fixtures: CA_FIXTURES });
    await installCapture(page);
    await page.evaluate(() => {
        FakePlatformClient.prototype.searchCode = async () => { throw new Error('search disabled'); };
    });

    await caret(page).click();

    await expect(page.locator('.differ-back-menu-message')).toContainText("check the calling diagrams");
    const link = page.locator('.differ-back-menu-link');
    await expect(link).toHaveText('Search in GitLab');
    await link.click();

    await expect.poll(() => getOpenCalls(page))
        .toContainEqual(['http://localhost/search?term=calledElement%3D%22Process_2%22', '_blank']);
});

// J6: clicking a (non-came-from) caller row opens that caller as a fresh differ,
// asking it to auto-select the call site (selectCalledProcessIds = this diagram's
// process ids). No divedInFrom is carried (this is the dive-out direction).
test('clicking a caller row opens that caller with the auto-select hint', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { ...CA_FIXTURES, searchHits: [{ path: 'caller-x.bpmn', line: 1, snippet: 'calledElement="Process_2"' }] }
    });
    await installCapture(page);

    await caret(page).click();
    const row = page.locator('.differ-back-menu-item');
    await expect(row).toHaveCount(1);
    await expect(row.locator('.differ-back-menu-name')).toHaveText('caller-x.bpmn');
    await row.click();

    await expect.poll(async () => (await getOpenDifferCalls(page)).length).toBe(1);
    const [call] = await getOpenDifferCalls(page);
    expect(call.params.filePath).toBe('caller-x.bpmn');
    expect(call.params.fileName).toBe('caller-x.bpmn');
    expect(call.params.selectCalledProcessIds).toEqual(['Process_2']);
    expect(call.params.divedInFrom).toBeUndefined();
    expect(call.msgId).toBe(await page.evaluate(() => BpmnDiffer.MSG_ID));
});
```

- [ ] **Step 2: Run the tests**

Run: `CI=1 npx playwright test test/e2e/differ-dive-out-menu.spec.js`
Expected: PASS (all four). A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-dive-out-menu.spec.js
git commit -m "test(e2e): cover dive-out caller menu spinner/list/empty/error (FEAT-0023, Layer-2 4e)"
```

---

### Task 4: Auto-select on caller open — the receiving side (J8, J9)

**Files:**
- Create: `test/e2e/differ-dive-out-autoselect.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `CALL_ACTIVITY_BPMN`, `BUSINESS_RULE_TASK_BPMN` from `./support/boot-differ`. (No capture needed — these assert in-page selection, not tab opening.)

- [ ] **Step 1: Write the file with two tests**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams,
    CALL_ACTIVITY_BPMN, BUSINESS_RULE_TASK_BPMN
} = require('./support/boot-differ');

// J8: a caller opened by diving out carries selectCalledProcessIds. On render the
// differ auto-selects the Call Activity whose calledElement matches (no user click) —
// the call site is "highlighted": its dive-in badge overlay appears.
test('auto-selects the Call Activity for selectCalledProcessIds on open', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ selectCalledProcessIds: ['Sub_Process'] }),
        fixtures: { xmlByRef: { 'mr-sha': CALL_ACTIVITY_BPMN, 'base-sha': CALL_ACTIVITY_BPMN } }
    });

    const badge = page.locator('.djs-overlay-note .dive-in-call-activity');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', 'Open the called diagram');
    await expect(page.locator('svg .djs-element.selected[data-element-id="CallActivity_1"]')).toBeVisible();
});

// J9: the same mechanism for the DMN->BPMN direction — a Business Rule Task is
// auto-selected by its decisionRef (the id namespace tells the directions apart).
test('auto-selects the Business Rule Task for a decision id on open', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ selectCalledProcessIds: ['My_Decision'] }),
        fixtures: { xmlByRef: { 'mr-sha': BUSINESS_RULE_TASK_BPMN, 'base-sha': BUSINESS_RULE_TASK_BPMN } }
    });

    const badge = page.locator('.djs-overlay-note .dive-in-call-activity');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', 'Open the called decision');
    await expect(page.locator('svg .djs-element.selected[data-element-id="BusinessRuleTask_1"]')).toBeVisible();
});
```

- [ ] **Step 2: Run the tests**

Run: `CI=1 npx playwright test test/e2e/differ-dive-out-autoselect.spec.js`
Expected: PASS (both). If a badge never appears, confirm the `selected` class lands (the panel re-assert loop may take a beat — `toBeVisible` already auto-retries to the default timeout). A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-dive-out-autoselect.spec.js
git commit -m "test(e2e): cover selectCalledProcessIds auto-select on caller open (FEAT-0023, Layer-2 4e)"
```

---

### Task 5: DMN→BPMN dive-out direction (J10)

**Files:**
- Create: `test/e2e/differ-dive-out-dmn.spec.js`

**Interfaces:**
- Consumes: `bootDmnDiffer`, `wireDiagnostics`, `defaultDmnParams`, `BASE_DMN` from `./support/boot-differ`; `installCapture`, `getOpenDifferCalls` from `./support/dive-out-capture`.

- [ ] **Step 1: Write the file with one test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootDmnDiffer, wireDiagnostics, defaultDmnParams, BASE_DMN
} = require('./support/boot-differ');
const { installCapture, getOpenDifferCalls } = require('./support/dive-out-capture');

// J10 (FEAT-0005): the DMN differ also has the dive-out menu. Its caret resolves
// BPMN files that call this decision (DecisionCallerLocator searches decisionRef=).
// Clicking a caller opens the BPMN differ (BPMN msgId, by extension) asking it to
// auto-select the Business Rule Task for this decision id.
test('DMN dive-out lists a BPMN caller and opens it with the decision auto-select hint', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: {
            xmlByRef: { 'mr-sha': BASE_DMN, 'base-sha': BASE_DMN },
            searchHits: [{ path: 'orders/place-order.bpmn', line: 1, snippet: 'decisionRef="Decision_1"' }]
        }
    });
    await installCapture(page);

    await page.locator('.differ-back-caret').click();
    const row = page.locator('.differ-back-menu-item');
    await expect(row).toHaveCount(1);
    await expect(row.locator('.differ-back-menu-name')).toHaveText('place-order.bpmn');
    await row.click();

    await expect.poll(async () => (await getOpenDifferCalls(page)).length).toBe(1);
    const [call] = await getOpenDifferCalls(page);
    expect(call.params.filePath).toBe('orders/place-order.bpmn');
    expect(call.params.fileName).toBe('place-order.bpmn');
    expect(call.params.selectCalledProcessIds).toEqual(['Decision_1']);
    expect(call.msgId).toBe(await page.evaluate(() => BpmnDiffer.MSG_ID)); // .bpmn -> BPMN differ
});
```

- [ ] **Step 2: Run the test**

Run: `CI=1 npx playwright test test/e2e/differ-dive-out-dmn.spec.js`
Expected: PASS. If the caret/menu is absent, confirm the DMN view mounts the back group (`setBackNavigator` + `build()`); if `selectCalledProcessIds` is empty, confirm `BASE_DMN` exposes `<decision id="Decision_1">`. A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-dive-out-dmn.spec.js
git commit -m "test(e2e): cover DMN-to-BPMN dive-out direction (FEAT-0005, Layer-2 4e)"
```

---

### Task 6: Cross-tab no-duplicate registry (K1, K2, K3)

**Files:**
- Create: `test/e2e/differ-cross-tab-dedup.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `CALL_ACTIVITY_BPMN` from `./support/boot-differ`; `installCapture`, `getOpenDifferCalls`, `getOpenCalls` from `./support/dive-out-capture`.
- Uses the Playwright `context` fixture (not `page`) to open a second real tab via `context.newPage()`.

- [ ] **Step 1: Write the file with three tests**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, CALL_ACTIVITY_BPMN
} = require('./support/boot-differ');
const {
    installCapture, getOpenDifferCalls, getOpenCalls
} = require('./support/dive-out-capture');

// The Call Activity resolves to this path; a sibling tab showing the same file is the
// duplicate BUG-0017 prevents. The fake's searchCode ignores the term, so the hit
// fully controls the resolved file.
const CALLED_PATH = 'processes/sub-process.bpmn';
const CALLED_HIT = { path: CALLED_PATH, line: 1, snippet: '<bpmn:process id="Sub_Process">' };
const DIVER_FIXTURES = { xmlByRef: { 'mr-sha': CALL_ACTIVITY_BPMN, 'base-sha': CALL_ACTIVITY_BPMN }, searchHits: [CALLED_HIT] };

// identityKeyFor(defaultBpmnParams, CALLED_PATH): refs joined with the file path.
const IDENTITY_KEY = ['http://localhost/p', '', 'mr-sha', 'base-sha', CALLED_PATH].join('\n');
const TAB_NAME = 'gl-bpmn-diff-tab:' + IDENTITY_KEY;

async function bootCalleeTab(context) {
    const callee = await context.newPage();
    wireDiagnostics(callee);
    // Same platform/refs as the diver, different file path -> same identity key the
    // diver computes for its dive target. Content is irrelevant; only the registry
    // name matters, so reuse the default fixtures.
    await bootBpmnDiffer(callee, {
        params: defaultBpmnParams({ filePath: CALLED_PATH, fileName: 'sub-process.bpmn' })
    });
    return callee;
}

async function diveInOnDiver(context) {
    const diver = await context.newPage();
    wireDiagnostics(diver);
    await bootBpmnDiffer(diver, { params: defaultBpmnParams(), fixtures: DIVER_FIXTURES });
    await installCapture(diver);
    await diver.locator('svg .djs-element[data-element-id="CallActivity_1"]').click();
    await diver.locator('.djs-overlay-note .dive-in-call-activity').click();
    return diver;
}

// K1: a tab already shows the called diagram, so diving into it brings that tab to
// the front (focus by its stable name) instead of opening a duplicate.
test('reuses an open tab for the same diagram instead of opening a duplicate', async ({ context }) => {
    await bootCalleeTab(context);
    const diver = await diveInOnDiver(context);

    // The "who-has" answer arrives ~instantly -> focus-by-name, not openDiffer.
    await expect.poll(() => getOpenCalls(diver)).toContainEqual(['', TAB_NAME]);
    expect(await getOpenDifferCalls(diver)).toEqual([]);
});

// K2 (non-vacuous control): with NO sibling tab, the same dive-in opens a fresh
// differ (the registry query times out with no answer).
test('opens a fresh differ when no tab shows the diagram', async ({ context }) => {
    const diver = await diveInOnDiver(context);

    await expect.poll(async () => (await getOpenDifferCalls(diver)).length).toBe(1);
    const [call] = await getOpenDifferCalls(diver);
    expect(call.params.filePath).toBe(CALLED_PATH);
    expect(await getOpenCalls(diver)).not.toContainEqual(['', TAB_NAME]); // no focus-by-name
});

// K3: a CLOSED tab leaves no stale registry entry, so it is never matched — diving
// into the diagram it used to show opens a fresh differ.
test('does not match a closed tab (no stale registry entry)', async ({ context }) => {
    const callee = await bootCalleeTab(context);
    await callee.close(); // pagehide closes its registry channel

    const diver = await diveInOnDiver(context);

    await expect.poll(async () => (await getOpenDifferCalls(diver)).length).toBe(1);
    expect((await getOpenDifferCalls(diver))[0].params.filePath).toBe(CALLED_PATH);
});
```

- [ ] **Step 2: Run the tests**

Run: `CI=1 npx playwright test test/e2e/differ-cross-tab-dedup.spec.js`
Expected: PASS (all three). K1 proves the dedup; K2 proves it is non-vacuous; K3 proves closed tabs leave no stale entry. A red is a real finding — investigate, do not loosen. (If K1 flakes, the issue is registration timing — `bootCalleeTab` awaits `show()`, which runs `registerTab`, before the diver queries; do not add sleeps to `src/`.)

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-cross-tab-dedup.spec.js
git commit -m "test(e2e): cover cross-tab no-duplicate registry (BUG-0017, Layer-2 4e)"
```

---

## Finalize 4e

- [ ] **Run the full suites green**

Run: `npm test` → unit suite unchanged & green (1060).
Run: `CI=1 npm run test:e2e` → all e2e specs green: existing 82 + **13 new** (J1-J10 + K1-K3) = **95** across 6 new files.

- [ ] **Push + MR** (branch `feature/e2e-phase4e`, branched from a fresh `origin/master`)

Use the `mr` skill (`--remove-source-branch`). Merge is the human's. Do not push with a red suite.

- [ ] **Update the auto-memory** `layer2-e2e-coverage.md` with a "Phase 4e SHIPPED" note covering: the dive-out (FEAT-0023) + cross-tab (BUG-0017) coverage; the **two new seams** — a fake `window.opener` (assigning it sticks) for opener paths, and **two real `context.newPage()` pages sharing the real `BroadcastChannel`** for the registry (who-has/i-have delivers in ~0 ms; absent key → false after the 150 ms `QUERY_TIMEOUT_MS`); the single new `dive-out-capture.js` (records `[url, name]` so focus-by-name `('', TAB_NAME)` vs `OPENER_TAB_TARGET` is distinguishable, plus `__openDifferCalls`/`__closeCount`); **test-only, no `src/`, no new fixtures, no `boot-differ.js` edit**; the new suite count; and the **feasibility verdict** that closes the spec's J/K Layer-2-vs-Layer-3 hedge — J and K are Layer-2, while **FEAT-0025 (re-highlight on reuse) is deferred (no `src/` code)** and the `navigateOpenerTab` present-branch (Section H) is a noted future 4d-2 follow-up the opener seam now unlocks.
