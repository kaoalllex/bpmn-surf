# Layer-2 Phase 4d-0: DMN input/output column diff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Errata (corrected post-merge — shipped in MR !148).** The "verified facts" claim that *"body rule input cells carry `data-element-id`, not `data-col-id`, so this matches only the header"* is **FALSE**: real dmn-js gives each body rule `<td>` BOTH `data-col-id` and `data-element-id` (class `cell input-cell`). So the plan's `.input-cell[data-col-id="<id>"]` locator matches the header `<th>` plus the body cells (Playwright strict-mode failure). **Production is correct** — the painter's `document.querySelector` returns the header `<th>` (first in DOM order) and paints it; the shipped tests scope the locator to **`th.input-cell[data-col-id="<id>"]`** (the same painted header cell). Intent-preserving, not an assertion loosening. The verbatim code blocks below are left as originally planned (historical record); the shipped specs use the `th.`-scoped form.

**Goal:** Characterize the DMN differ's add/remove/changed **input and output COLUMN** diff rendering at Layer-2 — the one piece of DMN parity carried over from Phase 4a (the 4a fixtures only ever had a single input and a single output column, so column add/remove was never exercised).

**Architecture:** Each test boots the real `DmnDiffer` in Chromium via the existing `bootDmnDiffer` helper with an in-memory `FakePlatformClient`, then asserts the inline `background-color` that `DmnDiffPainter` writes onto the rendered dmn-js table header cells. This is **pure single-canvas diff paint — no multi-tab, no `window.open`, no navigation** — so 4d-0 is the most self-contained sub-phase and is **test-only + 2 new DMN fixtures**, no `src/` change. It runs fully in parallel with 4d-1/4d-2/4d-3 (it touches only its own specs, its own fixtures, and the `boot-differ.js` export block).

**Tech Stack:** Vanilla JS (ES6+), `@playwright/test` (dev-only runner), `node:test` (unit, unaffected), the existing Layer-2 harness (`test/e2e/harness/differ-harness.html`, `test/e2e/support/boot-differ.js`, `fake-platform-client.js`, `static-server.js`). Harness already loads `src/differ/styles.css` (since 4a).

## Global Constraints

- Vanilla JS (ES6+), no build step, **no new runtime dependencies**; `@playwright/test` is the already-agreed dev dependency. (CLAUDE.md)
- E2E files are named `*.spec.js` — **never** `*.test.js`. (docs/testing.md, playwright.config.js)
- `npm test` (unit) stays unit-only and fast; e2e is the separate `npm run test:e2e`. (docs/testing.md)
- All code comments and docs are in **English only**. (CLAUDE.md)
- **master is protected** — do all work on a feature branch (`feature/e2e-phase4d0`), branched from a freshly fetched `origin/master`; completing the work = push the branch + open an MR (skill `mr`, with `--remove-source-branch`) after green tests, without separate permission. Merge is the human's. (CLAUDE.md, docs/git-workflow.md)
- Commits are **minimalist, with NO `Co-Authored-By` line and no tool mentions** (overrides the harness default). (session rules)
- This plan adds **tests + 2 DMN fixtures only** — **no production `src/` changes**. The shared differ-page classes are NOT touched.
- **Characterization of shipped behaviour**: expected to PASS once written. A RED on an existing-behaviour assertion is a real finding — do **not** loosen it, do **not** touch `src/`; investigate with superpowers:systematic-debugging. The ONE allowed exception: a red that exposes a genuine bug is the user's call — surface the finding with options and, only if confirmed, file a BUG issue and pin it (as BUG-0025 was handled in 4b).

**⚠️ FIXTURE NAME-COLLISION CHECK (mandatory first action):** run `ls test/fixtures/ test/e2e/fixtures/` before creating any fixture. The two new fixtures are `test/fixtures/added-input-column.dmn` and `test/fixtures/added-output-column.dmn` — confirmed absent today. DMN fixtures live in `test/fixtures/` (semantic-only, no DI — dmn-js renders the table from semantics). Do NOT reuse or overwrite an existing name (4a lesson: an implementer once clobbered a unit-pinned golden).

---

## Reference — verified facts (from `dmn-xml-comparator.js`, `dmn-differ.js`, `dmn-diff-painter.js`, `diff-type.js`, `base.dmn`)

**Comparator (`dmn-xml-comparator.js`):** comparing "my" decision table against "other" doc:
- `missingInputIds` += `<input>` id present in my, **absent** in other (by `getElementById`). `changedInputIds` += same id, **different `outerHTML`**.
- `missingOutputLabels` += the `<output>` **`label` attribute** (not id) present in my, absent in other. `changedOutputLabels` += label when same id, different `outerHTML`.

**Direction / colour (`dmn-differ.js`):**
- Showing the **MR side** → `paint(diff, DiffType.ADD)` → `diffTypeForMissing = ADD`.
- Showing the **target/branch side** (after Switch) → `paint(diff, DiffType.REMOVE)` → `diffTypeForMissing = REMOVE`.
- A *missing* column is painted `diffTypeForMissing.shapeColor`; a *changed* column is always `DiffType.CHANGE.shapeColor`.
- `DiffType` colours (`diff-type.js`), as the computed `background-color` Playwright sees:
  - `ADD.shapeColor = '#88ff88'` → **`rgb(136, 255, 136)`** (green)
  - `REMOVE.shapeColor = '#ff8888'` → **`rgb(255, 136, 136)`** (red)
  - `CHANGE.shapeColor = '#8888ff'` → **`rgb(136, 136, 255)`** (blue)

**Painter selectors (`dmn-diff-painter.js`):**
- Input column header: `document.querySelector('.input-cell[data-col-id="<id>"]')` → `cell.style.backgroundColor`. (Body rule input cells carry `data-element-id`, not `data-col-id`, so this matches only the header.)
- Output column header: `Array.from(document.querySelectorAll('.output-label'))`, find the one whose `textContent === <label>`, then paint **`cell.parentElement.style.backgroundColor`**. → in Playwright, target `.output-label` by text and assert on its **parent** (`xpath=..`).

**Key consequence for fixtures — the column-bearing fixture must be on the SHOWN side:**
- A *missing* column only renders on the side that **has** the column. So:
  - **ADD (green):** put the extra-column fixture on the **MR** side (shown first), base on the target side → the extra column is missing-in-other → green on the MR side.
  - **REMOVE (red):** put the extra-column fixture on the **target** side, base on the MR side → after Switch the shown target has the extra column missing-in-other → red.
  - **CHANGED (blue):** same id, different content on both sides → use the existing `changed-input.dmn` / `changed-output-label.dmn` fixtures vs `base.dmn`.

**`base.dmn`:** one input `Input_1` (label "Amount", expr `amount`), one output `Output_1` (label "Discount"), rules `Rule_1` (`< 100` → `0`) and `Rule_2` (`>= 100` → `0.1`).

**Existing DMN fixtures (reuse, do not recreate):** `test/fixtures/base.dmn`, `changed-input.dmn` (Input_1 expression `amount`→`total`, same id → CHANGED input), `changed-output-label.dmn` (Output_1 label `Discount`→`Rebate`, same id → CHANGED output). `boot-differ.js` already exports `BASE_DMN`, `CHANGED_HEADER_DMN`, etc.; it does **not** yet export `CHANGED_INPUT_DMN` / `CHANGED_OUTPUT_LABEL_DMN` / the two new column fixtures — Task 1 adds those exports.

**Harness boot:** `bootDmnDiffer(page, { params = defaultDmnParams(), fixtures = DMN_FIXTURES })`; default `defaultDmnParams` has `sourceRef:'mr-sha'`, `targetRef:'base-sha'`. `fixtures.xmlByRef['mr-sha']` is the MR side, `['base-sha']` the target side. Switch button: `getByRole('button', { name: 'Switch branch' })`.

## File Structure

New fixtures (`test/fixtures/`, semantic-only, no DI):
- `added-input-column.dmn` — `base.dmn` + a second input `Input_2` (label "Customer", expr `customer`) and the matching `<inputEntry>` in each rule.
- `added-output-column.dmn` — `base.dmn` + a second output `Output_2` (label "Status", name `status`) and the matching `<outputEntry>` in each rule.

Modified (additive only):
- `test/e2e/support/boot-differ.js` — read + export `ADDED_INPUT_COLUMN_DMN`, `ADDED_OUTPUT_COLUMN_DMN`, `CHANGED_INPUT_DMN`, `CHANGED_OUTPUT_LABEL_DMN`.

New spec files (all under `test/e2e/`):
- `dmn-input-column.spec.js` — Task 2 (added input → green on MR; removed → red after Switch; changed → blue)
- `dmn-output-column.spec.js` — Task 3 (added output → green on MR; removed → red after Switch; changed → blue)

---

### Task 1: Fixtures + boot-differ exports

**Files:**
- Create: `test/fixtures/added-input-column.dmn`, `test/fixtures/added-output-column.dmn`
- Modify: `test/e2e/support/boot-differ.js`

**Interfaces:**
- Produces: `ADDED_INPUT_COLUMN_DMN`, `ADDED_OUTPUT_COLUMN_DMN`, `CHANGED_INPUT_DMN`, `CHANGED_OUTPUT_LABEL_DMN` exports consumed by Tasks 2–3.

- [ ] **Step 1: Collision check**

Run: `ls test/fixtures/ test/e2e/fixtures/`
Expected: neither `added-input-column.dmn` nor `added-output-column.dmn` is present.

- [ ] **Step 2: Create `test/fixtures/added-input-column.dmn`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="Definitions_1" name="discount" namespace="http://camunda.org/schema/1.0/dmn">
  <decision id="Decision_1" name="Discount">
    <decisionTable id="DecisionTable_1" hitPolicy="FIRST">
      <input id="Input_1" label="Amount">
        <inputExpression id="InputExpression_1" typeRef="integer">
          <text>amount</text>
        </inputExpression>
      </input>
      <input id="Input_2" label="Customer">
        <inputExpression id="InputExpression_2" typeRef="string">
          <text>customer</text>
        </inputExpression>
      </input>
      <output id="Output_1" label="Discount" name="discount" typeRef="double" />
      <rule id="Rule_1">
        <description>small order</description>
        <inputEntry id="UnaryTests_1">
          <text>&lt; 100</text>
        </inputEntry>
        <inputEntry id="UnaryTests_1b">
          <text></text>
        </inputEntry>
        <outputEntry id="LiteralExpression_1">
          <text>0</text>
        </outputEntry>
      </rule>
      <rule id="Rule_2">
        <description>big order</description>
        <inputEntry id="UnaryTests_2">
          <text>&gt;= 100</text>
        </inputEntry>
        <inputEntry id="UnaryTests_2b">
          <text></text>
        </inputEntry>
        <outputEntry id="LiteralExpression_2">
          <text>0.1</text>
        </outputEntry>
      </rule>
    </decisionTable>
  </decision>
</definitions>
```

- [ ] **Step 3: Create `test/fixtures/added-output-column.dmn`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="Definitions_1" name="discount" namespace="http://camunda.org/schema/1.0/dmn">
  <decision id="Decision_1" name="Discount">
    <decisionTable id="DecisionTable_1" hitPolicy="FIRST">
      <input id="Input_1" label="Amount">
        <inputExpression id="InputExpression_1" typeRef="integer">
          <text>amount</text>
        </inputExpression>
      </input>
      <output id="Output_1" label="Discount" name="discount" typeRef="double" />
      <output id="Output_2" label="Status" name="status" typeRef="string" />
      <rule id="Rule_1">
        <description>small order</description>
        <inputEntry id="UnaryTests_1">
          <text>&lt; 100</text>
        </inputEntry>
        <outputEntry id="LiteralExpression_1">
          <text>0</text>
        </outputEntry>
        <outputEntry id="LiteralExpression_1b">
          <text>"regular"</text>
        </outputEntry>
      </rule>
      <rule id="Rule_2">
        <description>big order</description>
        <inputEntry id="UnaryTests_2">
          <text>&gt;= 100</text>
        </inputEntry>
        <outputEntry id="LiteralExpression_2">
          <text>0.1</text>
        </outputEntry>
        <outputEntry id="LiteralExpression_2b">
          <text>"vip"</text>
        </outputEntry>
      </rule>
    </decisionTable>
  </decision>
</definitions>
```

- [ ] **Step 4: Add exports to `boot-differ.js`**

After the existing DMN fixture reads (the block with `CHANGED_HEADER_DMN`), add:

```js
const CHANGED_INPUT_DMN = read('test/fixtures/changed-input.dmn');
const CHANGED_OUTPUT_LABEL_DMN = read('test/fixtures/changed-output-label.dmn');
const ADDED_INPUT_COLUMN_DMN = read('test/fixtures/added-input-column.dmn');
const ADDED_OUTPUT_COLUMN_DMN = read('test/fixtures/added-output-column.dmn');
```

Then add all four names to the `module.exports` object (the line that already exports `BASE_DMN, ADDED_RULE_DMN, CHANGED_CELL_DMN, CHANGED_HEADER_DMN, DMN_FIXTURES`).

- [ ] **Step 5: Sanity-check the fixtures parse + commit**

Run: `npx playwright test test/e2e/dmn-boot.spec.js`
Expected: PASS (unaffected — confirms the harness still boots).

```bash
git add test/fixtures/added-input-column.dmn test/fixtures/added-output-column.dmn test/e2e/support/boot-differ.js
git commit -m "test(e2e): add DMN added-column fixtures + boot exports (Layer-2 4d-0)"
```

---

### Task 2: Input column diff — added/removed/changed

**Files:**
- Create: `test/e2e/dmn-input-column.spec.js`

**Interfaces:**
- Consumes: `bootDmnDiffer`, `wireDiagnostics`, `defaultDmnParams`, `BASE_DMN`, `ADDED_INPUT_COLUMN_DMN`, `CHANGED_INPUT_DMN` from `./support/boot-differ`.

- [ ] **Step 1: Write the file with three tests**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootDmnDiffer, wireDiagnostics, defaultDmnParams,
    BASE_DMN, ADDED_INPUT_COLUMN_DMN, CHANGED_INPUT_DMN
} = require('./support/boot-differ');

const GREEN = 'rgb(136, 255, 136)';   // DiffType.ADD
const RED = 'rgb(255, 136, 136)';     // DiffType.REMOVE
const BLUE = 'rgb(136, 136, 255)';    // DiffType.CHANGE

// An input column present in the MR but not the base is "added": the comparator
// reports it as missing-in-other while the MR side is shown, so the painter fills
// the column header (.input-cell[data-col-id]) green. The base side has no such
// column, so nothing about Input_2 renders there.
test('paints an added input column green on the MR side', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': ADDED_INPUT_COLUMN_DMN, 'base-sha': BASE_DMN } }
    });

    const header = page.locator('.input-cell[data-col-id="Input_2"]');
    await expect(header).toBeVisible();
    await expect(header).toHaveCSS('background-color', GREEN);
});

// The same column, now present only in the target version: after Switch the shown
// target side has Input_2 missing-in-other, so it is painted red (REMOVE).
test('paints a removed input column red after Switch', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': BASE_DMN, 'base-sha': ADDED_INPUT_COLUMN_DMN } }
    });

    await page.getByRole('button', { name: 'Switch branch' }).click();

    const header = page.locator('.input-cell[data-col-id="Input_2"]');
    await expect(header).toBeVisible();
    await expect(header).toHaveCSS('background-color', RED);
});

// Same input id on both sides but a different <inputExpression> → CHANGED → blue,
// regardless of the shown side (changed columns always use DiffType.CHANGE).
test('paints a changed input column blue', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': CHANGED_INPUT_DMN, 'base-sha': BASE_DMN } }
    });

    const header = page.locator('.input-cell[data-col-id="Input_1"]');
    await expect(header).toBeVisible();
    await expect(header).toHaveCSS('background-color', BLUE);
});
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test test/e2e/dmn-input-column.spec.js`
Expected: PASS (all three). A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/dmn-input-column.spec.js
git commit -m "test(e2e): cover DMN input column add/remove/change paint (Layer-2 4d-0)"
```

---

### Task 3: Output column diff — added/removed/changed

**Files:**
- Create: `test/e2e/dmn-output-column.spec.js`

**Interfaces:**
- Consumes: `bootDmnDiffer`, `wireDiagnostics`, `defaultDmnParams`, `BASE_DMN`, `ADDED_OUTPUT_COLUMN_DMN`, `CHANGED_OUTPUT_LABEL_DMN` from `./support/boot-differ`.

- [ ] **Step 1: Write the file with three tests**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootDmnDiffer, wireDiagnostics, defaultDmnParams,
    BASE_DMN, ADDED_OUTPUT_COLUMN_DMN, CHANGED_OUTPUT_LABEL_DMN
} = require('./support/boot-differ');

const GREEN = 'rgb(136, 255, 136)';
const RED = 'rgb(255, 136, 136)';
const BLUE = 'rgb(136, 136, 255)';

// The painter finds the output header by matching .output-label textContent, then
// fills its PARENT cell. So locate the label by text and assert on its parent.
function outputHeader(page, label) {
    return page.locator('.output-label', { hasText: label }).locator('xpath=..');
}

// An output column present in the MR but not the base is "added" → green on the MR
// side. The label "Status" only exists in the MR fixture.
test('paints an added output column green on the MR side', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': ADDED_OUTPUT_COLUMN_DMN, 'base-sha': BASE_DMN } }
    });

    const header = outputHeader(page, 'Status');
    await expect(header).toBeVisible();
    await expect(header).toHaveCSS('background-color', GREEN);
});

// Same column present only in the target → red after Switch (REMOVE).
test('paints a removed output column red after Switch', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': BASE_DMN, 'base-sha': ADDED_OUTPUT_COLUMN_DMN } }
    });

    await page.getByRole('button', { name: 'Switch branch' }).click();

    const header = outputHeader(page, 'Status');
    await expect(header).toBeVisible();
    await expect(header).toHaveCSS('background-color', RED);
});

// Same output id, changed label ("Discount" → "Rebate") → CHANGED → blue. The MR
// side shows the new label "Rebate"; the comparator reports it as changedOutputLabel.
test('paints a changed output column blue', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': CHANGED_OUTPUT_LABEL_DMN, 'base-sha': BASE_DMN } }
    });

    const header = outputHeader(page, 'Rebate');
    await expect(header).toBeVisible();
    await expect(header).toHaveCSS('background-color', BLUE);
});
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test test/e2e/dmn-output-column.spec.js`
Expected: PASS (all three). Note: `changedOutputLabels` carries the **`label` attribute of the shown ("my") side**, which on the MR side is the *new* label `Rebate` — that is why the changed-output test matches `Rebate`. A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/dmn-output-column.spec.js
git commit -m "test(e2e): cover DMN output column add/remove/change paint (Layer-2 4d-0)"
```

---

## Finalize 4d-0

- [ ] **Run the full suites green**

Run: `npm test` → unit suite unchanged & green.
Run: `npm run test:e2e` → all e2e specs green (existing set + 6 new tests across 2 new files; no existing spec regressed — this plan adds tests + fixtures only).

- [ ] **Push + MR** (branch `feature/e2e-phase4d0`, branched from fresh `origin/master`)

Use the `mr` skill (push + open MR into master with `--remove-source-branch`). Merge is the human's. Do not push with a red suite.

- [ ] **Update the auto-memory** `layer2-e2e-coverage.md` with a "Phase 4d-0 SHIPPED" note: DMN input/output column add/remove/change paint, the two new column fixtures, the "column-bearing fixture must be on the shown side" rule, the output-header `.output-label` text → parent paint locator, and the updated suite count.
