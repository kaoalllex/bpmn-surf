# Layer-2 Section H — `navigateOpenerTab` PRESENT-branch characterization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one Layer-2 e2e test characterizing the present-`window.opener` branch of `DifferTabNavigator.navigateOpenerTab` — a changed-handler badge click navigates the already-open opener tab to the handler's MR-diff URL instead of opening a new tab.

**Architecture:** Pure test-only characterization of shipped behavior. Boot the real `BpmnDiffer` in the Playwright harness with an injected `FakePlatformClient`, install the Phase-4e fake `window.opener` + `[url, name]` capture seam (`dive-out-capture.js`), click the changed-handler badge, and assert `window.open(mrDiffUrl, OPENER_TAB_TARGET)` fired exactly once (no `'_blank'` fallback). PASS is expected because the branch is already implemented; a RED is a real finding.

**Tech Stack:** `@playwright/test` (Layer-2 e2e), vanilla JS ES6+, existing `test/e2e/support/` helpers.

**Spec:** `docs/superpowers/specs/2026-07-01-layer2-section-h-navigate-opener-present-design.md`

## Global Constraints

- TEST-ONLY: **no `src/` change** (the present branch is already implemented — characterize, do not modify).
- No new fixtures (reuse `handler-badges.bpmn` via `HANDLER_BADGES_BPMN`). No `boot-differ.js` edit. No support-file edit (reuse `dive-out-capture.js` as-is).
- Do **not** modify or break the 4d-2 tests (`test/e2e/differ-handler-badge-click.spec.js`) — run them to confirm.
- e2e under `CI=1` (hermetic, port 4173). Spec files are `*.spec.js` (never `*.test.js`).
- Characterization → PASS expected. A RED is a real finding: do **not** weaken asserts, do **not** touch `src/`; debug via superpowers:systematic-debugging; a genuine bug is the user's call.
- Vanilla JS (ES6+); comments/docs in English. Commits minimal, without `Co-Authored-By` or tool mentions.
- Branch: `feature/e2e-section-h` (already created from fresh `origin/master`). master is protected — never push to it.

## Verified facts (from source, this session)

- `navigateOpenerTab` present-branch (`src/differ/shared/differ-tab-navigator.js:220-242`): with a non-closed `window.opener`, sets `opener.name = OPENER_TAB_TARGET`, calls `window.open(url, OPENER_TAB_TARGET)`, restores the name, returns `true`. `OPENER_TAB_TARGET === 'gl-bpmn-diff-opener-tab'` (line 27).
- Wiring (`src/differ/bpmn/bpmn-differ.js:115-124`): `HandlerNavigator`'s `navigateOpenerFunc = (url) => this.#tabNavigator.navigateOpenerTab(url)` and `openUrlFunc = (url) => window.open(url, '_blank')`.
- Changed-handler click (`src/differ/navigation/handler-navigator.js:130-141`): `if (url && !navigateOpenerFunc(url)) openUrlFunc(url)`. Present branch returns `true` → fallback skipped → the only `window.open` is `[mrDiffUrl, OPENER_TAB_TARGET]`.
- `mrDiffUrl` (`src/differ/navigation/handler-locator.js:346-350`): `prDiffsUrl(42)` + `#` + SHA-1(filePath) → `http://localhost/mr/42/diffs#<40 hex>`.
- `dive-out-capture.js` (`test/e2e/support/`): `installCapture(page, { opener:true })` installs a sticky fake `window.opener = { closed:false, name:'', focus(){} }` and stubs `window.open` → `__openCalls: [[url, name], ...]`; `getOpenCalls(page)` returns that array.
- BPMN-only: `dmn-differ.js` has no handler navigation → no DMN analog.
- Baseline: 95 e2e + 1060 unit green on `origin/master` @ b0c33e2. Target after this plan: **96 e2e**.

---

### Task 1: Present-branch characterization spec

**Files:**
- Create: `test/e2e/differ-handler-badge-opener.spec.js`
- Read-only reuse: `test/e2e/support/boot-differ.js` (`bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `HANDLER_BADGES_BPMN`), `test/e2e/support/dive-out-capture.js` (`installCapture`, `getOpenCalls`)
- Sibling to keep green (do not edit): `test/e2e/differ-handler-badge-click.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer(page, { params, fixtures })`, `defaultBpmnParams({ changeRequestId })`, `HANDLER_BADGES_BPMN`, `wireDiagnostics(page)` from `./support/boot-differ`; `installCapture(page, { opener })`, `getOpenCalls(page)` from `./support/dive-out-capture`.
- Produces: nothing consumed by other tasks (single-task plan).

- [ ] **Step 1: Pre-flight — confirm no name collision and record the baseline**

Run:
```bash
ls test/e2e/differ-handler-badge-opener.spec.js 2>/dev/null && echo "COLLISION — stop" || echo "name free"
CI=1 npx playwright test test/e2e/differ-handler-badge-click.spec.js
```
Expected: `name free`; the 4d-2 sibling reports 3 passed. (Records that 4d-2 is green before we add anything.)

- [ ] **Step 2: Write the characterization spec**

Create `test/e2e/differ-handler-badge-opener.spec.js` with exactly this content:

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, HANDLER_BADGES_BPMN
} = require('./support/boot-differ');
const { installCapture, getOpenCalls } = require('./support/dive-out-capture');

// Section H: PRESENT-branch of DifferTabNavigator.navigateOpenerTab. With a fake
// same-origin window.opener installed (the Phase 4e seam), clicking a CHANGED
// handler badge navigates the already-open opener tab to the handler's MR-diff URL
// — window.open(mrDiffUrl, OPENER_TAB_TARGET) returns true, so the differ does NOT
// fall back to a new tab. The absent-opener branch (fallback to window.open(url,
// '_blank')) is the counterpart covered by differ-handler-badge-click.spec.js
// ("changed handler click opens the MR diff (opener-tab fallback)").
//
// The dive-out capture seam records window.open as [url, name], so the present
// target OPENER_TAB_TARGET is distinguishable from the fallback '_blank' — unlike
// handler-open-capture.js, which records a single-arg [url].
test('changed handler click navigates the opener tab to the MR diff (opener present)', async ({ page }) => {
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
    await installCapture(page, { opener: true });
    const openerTarget = await page.evaluate(() => DifferTabNavigator.OPENER_TAB_TARGET);

    const badge = page.locator('.handler-link-added');
    await expect(badge).toBeVisible();
    await badge.click();

    // Exactly one window.open — the opener navigation; the bare-url fallback did NOT fire.
    await expect.poll(async () => (await getOpenCalls(page)).length).toBe(1);
    const [[url, name]] = await getOpenCalls(page);
    expect(url).toMatch(/^http:\/\/localhost\/mr\/42\/diffs#[0-9a-f]{40}$/); // sha1-anchored MR diff
    expect(name).toBe(openerTarget);                                        // present branch, not '_blank'
});
```

- [ ] **Step 3: Run the new spec — expect PASS (characterization)**

Run:
```bash
CI=1 npx playwright test test/e2e/differ-handler-badge-opener.spec.js
```
Expected: 1 passed.

If RED: this is a real finding. Do NOT weaken the asserts and do NOT touch `src/`. Inspect the trace/screenshot and the `[pageerror]`/`[console.error]` lines, then debug via superpowers:systematic-debugging; a genuine `src/` bug is the user's decision.

- [ ] **Step 4: Confirm the 4d-2 sibling still passes (no regression)**

Run:
```bash
CI=1 npx playwright test test/e2e/differ-handler-badge-click.spec.js
```
Expected: 3 passed (unchanged from Step 1).

- [ ] **Step 5: Run the full suites — unit + e2e green at the new baseline**

Run:
```bash
npm test
CI=1 npm run test:e2e
```
Expected: unit 1060 passing; e2e **96 passed** (95 baseline + 1 new).

- [ ] **Step 6: Commit**

```bash
git add test/e2e/differ-handler-badge-opener.spec.js
git commit -m "test(e2e): Layer-2 Section H — navigateOpenerTab present-branch"
```

---

## After the plan (post-execution, driven by the outer session)

1. **Whole-branch review** (opus, pure static review — no Playwright/dev-server, per the 4d/4e process note).
2. **Update auto-memory** `layer2-e2e-coverage.md`: Section H present-branch covered via the `dive-out-capture.js` `[url, name]` + fake-opener seam; e2e 95 → 96.
3. **Push + MR** into master via the `mr` skill (`glab mr create --remove-source-branch`). Merge is the human's.

## Self-Review

- **Spec coverage:** goal (present-branch characterization) → Task 1; seam decision (reuse `dive-out-capture.js`) → Task 1 imports; single test → Task 1 Step 2; guardrails (no `src/`, no new fixtures, 4d-2 intact, `CI=1`, RED handling) → Global Constraints + Steps 3-4; done criteria (1060 unit + 96 e2e, MR, memory) → Steps 4-6 + post-execution. No gaps.
- **Placeholder scan:** no TBD/TODO/"handle edge cases"; the full test code is inline. Clean.
- **Type consistency:** helper names match the source reads — `installCapture`/`getOpenCalls` (dive-out-capture.js), `bootBpmnDiffer`/`defaultBpmnParams`/`HANDLER_BADGES_BPMN`/`wireDiagnostics` (boot-differ.js), `DifferTabNavigator.OPENER_TAB_TARGET`, `.handler-link-added`. Consistent.
