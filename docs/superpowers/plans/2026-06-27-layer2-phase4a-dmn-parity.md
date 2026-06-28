# Layer-2 Phase 4a: DMN parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the DMN differ's Layer-2 e2e coverage up to the BPMN differ's level — diff highlighting (added/removed/changed rule, changed cell, changed header), switch-branch, and the two absent states — plus the harness CSS enabler.

**Architecture:** Each task adds one `test/e2e/*.spec.js` that boots the real `DmnDiffer` in Chromium via the existing `bootDmnDiffer` helper with an in-memory `FakePlatformClient`. The DMN differ **auto-paints** the diff on render (no on/off toggle, unlike BPMN), and it sets diff colours **inline** (`style.backgroundColor`), so the colours are assertable by `toHaveCSS` without loading `styles.css`. One new semantic fixture (`dmn-cell-changed.dmn`) covers the changed-cell case, the changed-header case reuses the existing `changed-header.dmn` golden (read-only), and the added/removed/switch/absent cases reuse the existing `base.dmn` (2 rules) + `added-rule.dmn` (3 rules) pair, with the refs swapped where needed.

**Tech Stack:** Vanilla JS (ES6+), `@playwright/test` (dev-only runner), `node:test` (unit, unaffected), the existing Layer-2 harness (`test/e2e/harness/differ-harness.html`, `test/e2e/support/boot-differ.js`, `fake-platform-client.js`, `static-server.js`).

## Global Constraints

- Vanilla JS (ES6+), no build step, **no new runtime dependencies**; `@playwright/test` is already an agreed dev dependency. (CLAUDE.md)
- E2E files are named `*.spec.js` — **never** `*.test.js` (the `node:test` glob `test/**/*.test.js` must keep ignoring them). (docs/testing.md)
- `npm test` (unit) stays unit-only and fast; e2e is the separate `npm run test:e2e`. (docs/testing.md)
- All code comments and docs are in **English only**. (CLAUDE.md)
- **master is protected** — do all work on a feature branch (e.g. `feature/e2e-phase4a`); completing the work = push the branch + open an MR after green tests, without separate permission. Merge is the human's. (CLAUDE.md, docs/git-workflow.md)
- Shared differ-page classes are used by both differs — but this plan adds **tests only** (plus two fixtures and one harness `<link>`), no production differ code changes, so the BPMN side is unaffected.
- These are **characterization / integration tests of shipped behavior**: a test is expected to PASS once written (and once its fixture exists). If a freshly written assertion of existing behavior goes RED, do **not** loosen it to match — a red means a real `DmnDiffPainter`/dmn-js selector drift or a bug; investigate with superpowers:systematic-debugging.

**Reference — DiffType colours (`src/differ/shared/diff-type.js`), as computed `rgb()`:**
- ADD `#88ff88` → `rgb(136, 255, 136)` (green)
- CHANGE `#8888ff` → `rgb(136, 136, 255)` (blue)
- REMOVE `#ff8888` → `rgb(255, 136, 136)` (red)

**Reference — how the DMN differ paints (verified in code):**
- `DmnDiffer.show()` renders the **MR (source) side first** when its XML exists, calling `#highlightDiffs(mrXml, branchXml, DiffType.ADD)`; the base side (after Switch) calls `#highlightDiffs(branchXml, mrXml, DiffType.REMOVE)`.
- `DmnDiffPainter` selectors: a rule row = the **parent** of `.rule-index[data-row-id="<ruleId>"]`; a changed entry cell = `[data-element-id="<inputEntry/outputEntry id>"]`; a changed description = `.cell.annotation`; the decision name header = `div.decision-table-name`; the hit-policy = `span.hit-policy-value`.
- A removed/added rule is only paintable on the side where it is **rendered** (it exists only in that version's table), so the "added" colour shows on the side that *has* the extra rule.
- Branch indicator span text: `"Changed · <sourceLabel>"` (source side), `"Original · <targetLabel>"` (target side), and `"<role> · <label> · file does not exist"` (absent target, italic, `gray`).
- Empty-state DOM: `.differ-empty-state` (the cover, `display:flex` when shown) containing `.differ-empty-state-message` (the centered text; **empty** string for the blank absent-side cover).
- Canvas cell id: `#dmnCanvas_12345bf3d4e842caa0d88194431197c0`.

---

## File Structure

- `test/e2e/dmn-highlight-added.spec.js` — Task 1 (added rule → green row)
- `test/e2e/dmn-highlight-removed.spec.js` — Task 2 (removed rule → red row)
- `test/e2e/dmn-highlight-changed-cell.spec.js` — Task 3 (changed cell → blue cell)
- `test/e2e/dmn-highlight-header.spec.js` — Task 4 (changed decision name → blue header)
- `test/e2e/dmn-switch-branch.spec.js` — Task 5 (indicator + diff flip on switch)
- `test/e2e/dmn-absent-side.spec.js` — Task 6 (blank cover + grey-italic label + Download disabled)
- `test/e2e/dmn-empty-state.spec.js` — Task 7 (both-absent centered message + Download disabled)
- `test/fixtures/dmn-cell-changed.dmn` — new fixture (Task 3): `base.dmn` with Rule_2's output entry changed. NOTE: `test/fixtures/changed-rule.dmn` already exists and is a golden pinned by `dmn-xml-comparator.test.js` / `dmn-diff-painter.test.js` (a multi-diff case) — do NOT reuse or modify it; this e2e gets its own single-diff fixture under a distinct name.
- (Task 4 reuses the EXISTING `test/fixtures/changed-header.dmn` golden — no new fixture)
- `test/e2e/support/boot-differ.js` — modified (Tasks 3, 4): add and export the two new fixture constants
- `test/e2e/harness/differ-harness.html` — modified (Task 8): load `src/differ/styles.css`

**Out of scope for 4a (deferred to 4b, with rationale):** DMN input/output **column** add/remove (`.input-cell[data-col-id]`, `.output-label`) — these need several extra fixtures and exercise the most drift-prone dmn-js selectors; better batched with the BPMN property-group work in 4b. Decision/back navigation (FEAT-0005) is Phase 4d/4e.

---

### Task 1: DMN added-rule highlight (green row)

**Files:**
- Create: `test/e2e/dmn-highlight-added.spec.js`

**Interfaces:**
- Consumes: `bootDmnDiffer(page, opts?)`, `wireDiagnostics(page)` from `./support/boot-differ` (default `DMN_FIXTURES`: target `base-sha`→`base.dmn` 2 rules, source `mr-sha`→`added-rule.dmn` 3 rules).
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootDmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// Default DMN scenario: the MR (mr-sha) adds Rule_3 over base. show() renders the
// MR side first and auto-paints the diff (no on/off toggle, unlike BPMN). The added
// rule's row gets the ADD colour (#88ff88 → rgb(136,255,136)), set inline by
// DmnDiffPainter on the parent of the .rule-index cell — assertable without styles.css.
test('paints an added decision rule green on the MR side', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page);

    const addedRow = page.locator('.rule-index[data-row-id="Rule_3"]').locator('xpath=..');
    await expect(addedRow).toBeVisible();
    await expect(addedRow).toHaveCSS('background-color', 'rgb(136, 255, 136)');
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test test/e2e/dmn-highlight-added.spec.js`
Expected: PASS (this characterizes shipped behavior). If it FAILS, do not adjust the assertion — investigate (selector drift / bug) per systematic-debugging; inspect the `[pageerror]`/`[console.error]` lines and the trace.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/dmn-highlight-added.spec.js
git commit -m "test(e2e): cover DMN added-rule diff highlight (Layer-2 4a)"
```

---

### Task 2: DMN removed-rule highlight (red row)

**Files:**
- Create: `test/e2e/dmn-highlight-removed.spec.js`

**Interfaces:**
- Consumes: `bootDmnDiffer`, `wireDiagnostics`, `defaultDmnParams`, `BASE_DMN`, `ADDED_RULE_DMN` from `./support/boot-differ`.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootDmnDiffer, wireDiagnostics, defaultDmnParams, BASE_DMN, ADDED_RULE_DMN
} = require('./support/boot-differ');

// Mirror of the added case with the versions swapped: the base (target) side has
// the extra Rule_3, the MR removed it. show() renders the MR side first (2 rules,
// nothing to highlight); switching to the base side renders the 3-rule table and
// paints the removed rule with the REMOVE colour (#ff8888 → rgb(255,136,136)).
test('paints a removed decision rule red on the base side', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'base-sha': ADDED_RULE_DMN, 'mr-sha': BASE_DMN } }
    });

    // MR side first: only 2 rules, no Rule_3 yet.
    await expect(page.locator('.rule-index[data-row-id="Rule_3"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Switch branch' }).click();

    const removedRow = page.locator('.rule-index[data-row-id="Rule_3"]').locator('xpath=..');
    await expect(removedRow).toBeVisible();
    await expect(removedRow).toHaveCSS('background-color', 'rgb(255, 136, 136)');
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test test/e2e/dmn-highlight-removed.spec.js`
Expected: PASS. A red here is a real finding — investigate, don't loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/dmn-highlight-removed.spec.js
git commit -m "test(e2e): cover DMN removed-rule diff highlight (Layer-2 4a)"
```

---

### Task 3: DMN changed-cell highlight (blue cell) + `dmn-cell-changed.dmn` fixture

**Files:**
- Create: `test/fixtures/dmn-cell-changed.dmn` (NOT `changed-rule.dmn` — that name is a pre-existing golden used by unit tests; do not touch it)
- Modify: `test/e2e/support/boot-differ.js` (add + export `CHANGED_CELL_DMN`)
- Create: `test/e2e/dmn-highlight-changed-cell.spec.js`

**Interfaces:**
- Consumes: `bootDmnDiffer`, `wireDiagnostics`, `defaultDmnParams`, `BASE_DMN` and the **new** `CHANGED_CELL_DMN` from `./support/boot-differ`.
- Produces: `CHANGED_CELL_DMN` — the string contents of `test/fixtures/dmn-cell-changed.dmn`, exported from `boot-differ.js` (consumed only by this task).

- [ ] **Step 1: Write the test (referencing the not-yet-exported fixture)**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootDmnDiffer, wireDiagnostics, defaultDmnParams, BASE_DMN, CHANGED_CELL_DMN
} = require('./support/boot-differ');

// dmn-cell-changed.dmn keeps both base rules but changes Rule_2's output entry
// (LiteralExpression_2: 0.1 → 0.15). On the MR side the kept-but-changed CELL is
// painted with the CHANGE colour (#8888ff → rgb(136,136,255)); the row itself is
// NOT repainted — only the changed cell, identified by its outputEntry id.
test('paints a changed rule cell blue on the MR side', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'base-sha': BASE_DMN, 'mr-sha': CHANGED_CELL_DMN } }
    });

    await expect(page.locator('[data-element-id="LiteralExpression_2"]'))
        .toHaveCSS('background-color', 'rgb(136, 136, 255)');
});
```

- [ ] **Step 2: Run the test to confirm it fails for the right reason**

Run: `npx playwright test test/e2e/dmn-highlight-changed-cell.spec.js`
Expected: FAIL — `CHANGED_CELL_DMN` is `undefined`, so the fake serves empty content for `mr-sha`, no blue cell is painted, and the `toHaveCSS` assertion times out. This proves the assertion exercises the paint path.

- [ ] **Step 3: Create the fixture `test/fixtures/dmn-cell-changed.dmn`**

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
      <rule id="Rule_1">
        <description>small order</description>
        <inputEntry id="UnaryTests_1">
          <text>&lt; 100</text>
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
        <outputEntry id="LiteralExpression_2">
          <text>0.15</text>
        </outputEntry>
      </rule>
    </decisionTable>
  </decision>
</definitions>
```

- [ ] **Step 4: Add and export the fixture constant in `test/e2e/support/boot-differ.js`**

Add the constant right after the `ADDED_RULE_DMN` line (currently line 26):

```js
const ADDED_RULE_DMN = read('test/fixtures/added-rule.dmn');
const CHANGED_CELL_DMN = read('test/fixtures/dmn-cell-changed.dmn');
```

Add it to the `module.exports` block — extend the DMN line (currently line 107):

```js
    BASE_DMN, ADDED_RULE_DMN, CHANGED_CELL_DMN, DMN_FIXTURES,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx playwright test test/e2e/dmn-highlight-changed-cell.spec.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add test/fixtures/dmn-cell-changed.dmn test/e2e/support/boot-differ.js test/e2e/dmn-highlight-changed-cell.spec.js
git commit -m "test(e2e): cover DMN changed-cell diff highlight (Layer-2 4a)"
```

---

### Task 4: DMN changed-header highlight (blue decision name) — reuses the existing `changed-header.dmn` golden

**Files:**
- Modify: `test/e2e/support/boot-differ.js` (add + export `CHANGED_HEADER_DMN`, reading the EXISTING `test/fixtures/changed-header.dmn`)
- Create: `test/e2e/dmn-highlight-header.spec.js`

**Interfaces:**
- Consumes: `bootDmnDiffer`, `wireDiagnostics`, `defaultDmnParams`, `BASE_DMN` and the **new** `CHANGED_HEADER_DMN` from `./support/boot-differ`.
- Produces: `CHANGED_HEADER_DMN` — contents of the pre-existing `test/fixtures/changed-header.dmn`, exported from `boot-differ.js` (consumed only by this task).

NOTE: `test/fixtures/changed-header.dmn` already exists and is a comparator golden (used read-only by `dmn-xml-comparator.test.js`). It is exactly the fixture this task needs: vs `base.dmn` it changes the decision **name** (`Discount` → `Rebate`) and the **hitPolicy** (`FIRST` → `COLLECT`), with rules identical to base. Do NOT create a new fixture and do NOT modify `changed-header.dmn` — only add a read-only `read()` export pointing at it. The painter flags both `div.decision-table-name` and `span.hit-policy-value`; this test asserts the decision-name header (the hit-policy is incidentally blue too, but we assert the name).

- [ ] **Step 1: Write the test (referencing the not-yet-exported constant)**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootDmnDiffer, wireDiagnostics, defaultDmnParams, BASE_DMN, CHANGED_HEADER_DMN
} = require('./support/boot-differ');

// changed-header.dmn (an existing golden) changes the decision name (Discount →
// Rebate) and the hit policy (FIRST → COLLECT) vs base.dmn; the rules are identical
// to base, so no row is highlighted — this isolates the header path. DmnXmlComparator
// flags div.decision-table-name, which DmnDiffPainter fills with the CHANGE colour
// (#8888ff → rgb(136,136,255)).
test('paints a changed decision name in the table header blue', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'base-sha': BASE_DMN, 'mr-sha': CHANGED_HEADER_DMN } }
    });

    await expect(page.locator('div.decision-table-name'))
        .toHaveCSS('background-color', 'rgb(136, 136, 255)');
});
```

- [ ] **Step 2: Run the test to confirm it fails for the right reason**

Run: `npx playwright test test/e2e/dmn-highlight-header.spec.js`
Expected: FAIL — `CHANGED_HEADER_DMN` is `undefined`, the fake serves empty content for `mr-sha`, no header diff is painted, assertion times out.

- [ ] **Step 3: Add and export the constant in `test/e2e/support/boot-differ.js`**

Add the constant after the `CHANGED_CELL_DMN` line (added in Task 3), reading the existing fixture:

```js
const CHANGED_CELL_DMN = read('test/fixtures/dmn-cell-changed.dmn');
const CHANGED_HEADER_DMN = read('test/fixtures/changed-header.dmn');
```

Extend the same `module.exports` DMN line:

```js
    BASE_DMN, ADDED_RULE_DMN, CHANGED_CELL_DMN, CHANGED_HEADER_DMN, DMN_FIXTURES,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test test/e2e/dmn-highlight-header.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/e2e/support/boot-differ.js test/e2e/dmn-highlight-header.spec.js
git commit -m "test(e2e): cover DMN changed-header diff highlight (Layer-2 4a)"
```

---

### Task 5: DMN switch-branch (indicator flip + added-row disappears)

**Files:**
- Create: `test/e2e/dmn-switch-branch.spec.js`

**Interfaces:**
- Consumes: `bootDmnDiffer`, `wireDiagnostics` from `./support/boot-differ` (default `DMN_FIXTURES`).
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootDmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// DMN analogue of the BPMN switch-branch test. show() renders the MR side first
// (Rule_3 added, indicator "Changed · feature"); "Switch branch" shows the base
// side where Rule_3 does not exist (indicator "Original · master"), and back.
test('switches between the MR and target versions (DMN)', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page);

    const addedRow = page.locator('.rule-index[data-row-id="Rule_3"]');
    const indicator = page.locator('.differ-toolbar span', { hasText: '·' });

    // MR side first: the added rule is present, source label shown.
    await expect(addedRow).toBeVisible();
    await expect(indicator).toContainText('Changed · feature');

    await page.getByRole('button', { name: 'Switch branch' }).click();

    // Base side: the added rule is gone, target label shown.
    await expect(addedRow).toHaveCount(0);
    await expect(indicator).toContainText('Original · master');

    // And back.
    await page.getByRole('button', { name: 'Switch branch' }).click();
    await expect(addedRow).toBeVisible();
    await expect(indicator).toContainText('Changed · feature');
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test test/e2e/dmn-switch-branch.spec.js`
Expected: PASS. A red is a real finding — investigate.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/dmn-switch-branch.spec.js
git commit -m "test(e2e): cover DMN switch-branch flip (Layer-2 4a)"
```

---

### Task 6: DMN absent-side placeholder (new file in MR)

**Files:**
- Create: `test/e2e/dmn-absent-side.spec.js`

**Interfaces:**
- Consumes: `bootDmnDiffer`, `wireDiagnostics`, `defaultDmnParams`, `ADDED_RULE_DMN` from `./support/boot-differ`.
- Produces: nothing other tasks consume.

Note: unlike the BPMN absent side (which clears the canvas with **no** cover), the DMN absent side shows a **blank cover** (`.differ-empty-state` with an empty message) because dmn-js has no `clear()`. The cover has no inline size and `styles.css` is not loaded here, so assert its `display` rather than visibility (an empty-message cover has zero height → `toBeVisible` would report hidden).

- [ ] **Step 1: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootDmnDiffer, wireDiagnostics, defaultDmnParams, ADDED_RULE_DMN
} = require('./support/boot-differ');

// New file in the MR: the base side has no file (base-sha is absent from the
// fixtures map → the fake serves empty content → "absent"). show() renders the MR
// side; switching to the absent base side shows a blank cover (empty message),
// marks the label italic-grey with "file does not exist", and disables Download
// (UX-0003 / BUG-0001). The absence is signalled in the label, not by a banner.
test('shows the absent-side placeholder when switching to a new file base side', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': ADDED_RULE_DMN } }   // base-sha missing → absent
    });

    await page.getByRole('button', { name: 'Switch branch' }).click();

    // Blank cover: present and shown (flex), but with no message text.
    const cover = page.locator('.differ-empty-state');
    await expect(cover).toHaveCSS('display', 'flex');
    await expect(page.locator('.differ-empty-state-message')).toHaveText('');

    // Absence is spelled out in the label: italic, grey, side-specific note.
    const indicator = page.locator('.differ-toolbar span', { hasText: '·' });
    await expect(indicator).toContainText('Original · master · file does not exist');
    await expect(indicator).toHaveCSS('color', 'rgb(128, 128, 128)');
    await expect(indicator).toHaveCSS('font-style', 'italic');

    // Nothing to download on the absent side.
    await expect(page.getByTitle('Download the file as shown for the current branch'))
        .toBeDisabled();
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test test/e2e/dmn-absent-side.spec.js`
Expected: PASS. (The `[console.error]` line "dmn file is unavailable…" is NOT emitted here — only one side is absent; the run log stays clean.) A red is a real finding.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/dmn-absent-side.spec.js
git commit -m "test(e2e): cover DMN absent-side placeholder (Layer-2 4a)"
```

---

### Task 7: DMN both-absent centered message

**Files:**
- Create: `test/e2e/dmn-empty-state.spec.js`

**Interfaces:**
- Consumes: `bootDmnDiffer`, `wireDiagnostics`, `defaultDmnParams` from `./support/boot-differ`.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootDmnDiffer, wireDiagnostics, defaultDmnParams
} = require('./support/boot-differ');

// Both refs point at content the fake does not have (empty fixtures map) →
// loadFileContent returns '' for each side → the DMN differ shows the centered
// "absent in both" placeholder and never imports a table (BUG-0001 / UX-0003).
// The expected "[console.error] dmn file is unavailable in both versions" line is
// the differ's own diagnostic — not a test failure.
test('shows a placeholder when the DMN file is absent in both versions', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams({ sourceRef: 'gone', targetRef: 'gone' }),
        fixtures: { xmlByRef: {} }
    });

    await expect(page.locator('.differ-empty-state')).toBeVisible();
    await expect(page.locator('.differ-empty-state-message'))
        .toHaveText('File does not exist in either version');
    // No decision table was rendered.
    await expect(page.locator('.rule-index')).toHaveCount(0);
    // Nothing to download.
    await expect(page.getByTitle('Download the file as shown for the current branch'))
        .toBeDisabled();
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test test/e2e/dmn-empty-state.spec.js`
Expected: PASS. A red is a real finding.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/dmn-empty-state.spec.js
git commit -m "test(e2e): cover DMN both-absent empty state (Layer-2 4a)"
```

---

### Task 8: Harness CSS enabler (load `styles.css`)

The gap analysis bundles this enabler with 4a. It is **isolated as the last task** with a full-suite gate, so the DMN-parity commits above are never blocked by it. It is not required by Tasks 1–7 (DMN diff colours are inline); its payoff is Phase 4b+ (CSS view-only invariants, marker-outline colours). Inline element styles win over stylesheet rules by specificity, so loading `styles.css` should not perturb the existing inline-driven assertions.

**Files:**
- Modify: `test/e2e/harness/differ-harness.html`

**Interfaces:**
- Consumes: the static server already serves `.css` as `text/css` (`test/e2e/support/static-server.js`) and the repo root, so `/src/differ/styles.css` is reachable.
- Produces: a harness page whose differ DOM is styled, for later phases.

- [ ] **Step 1: Add the stylesheet link to the harness `<head>`**

Replace the `<head>` block of `test/e2e/harness/differ-harness.html`:

```html
<head>
    <meta charset="utf-8">
    <title>differ harness</title>
    <link rel="stylesheet" href="/src/differ/styles.css">
</head>
```

- [ ] **Step 2: Run the full e2e suite to confirm nothing regressed**

Run: `npm run test:e2e`
Expected: PASS — all Layer-2 specs (the 12 prior + the 7 new DMN ones) green. If any previously-green spec turns red, the inline-vs-stylesheet assumption broke for that case: investigate with superpowers:systematic-debugging. If it cannot be resolved quickly, **revert this single file change** (`git checkout -- test/e2e/harness/differ-harness.html`) and ship Tasks 1–7 without it, leaving the enabler to its own follow-up — the DMN-parity value does not depend on it.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/harness/differ-harness.html
git commit -m "test(e2e): load styles.css in the differ harness (Layer-2 enabler)"
```

---

## Final verification (before MR)

- [ ] Run the whole e2e suite once more: `npm run test:e2e` → all green.
- [ ] Run the unit suite to confirm it is untouched: `npm test` → all green (these tasks add no `*.test.js` and no production code).
- [ ] Update docs: in `docs/testing.md`, extend the "Scope so far" e2e paragraph to mention the DMN diff-highlight (added/removed/changed/header), DMN switch-branch, and DMN absent/both-absent specs, and (if Task 8 landed) that the harness now loads `styles.css`. Update the memory note `layer2-e2e-coverage.md` to mark Phase 4a done.
- [ ] Push the feature branch and open the MR into master (via the `mr` skill), after green tests. Merge is the human's.

## Self-Review notes (author)

- **Spec coverage vs the gap analysis area A:** added ✓ (Task 1), removed ✓ (Task 2), changed-cell ✓ (Task 3), changed-header ✓ (Task 4), switch-branch ✓ (Task 5), absent-side ✓ (Task 6), both-absent ✓ (Task 7), styles.css enabler ✓ (Task 8). Input/output **column** add/remove is explicitly deferred to 4b with rationale (fixture/selector cost) — the only area-A item not in this plan.
- **Type/name consistency:** the two new exported constants are named `CHANGED_CELL_DMN` (from the new `dmn-cell-changed.dmn`) and `CHANGED_HEADER_DMN` (from the pre-existing `changed-header.dmn` golden, read-only) and referenced identically in Tasks 3/4; both are appended to the single `module.exports` DMN line, which after Task 4 reads `BASE_DMN, ADDED_RULE_DMN, CHANGED_CELL_DMN, CHANGED_HEADER_DMN, DMN_FIXTURES,`. The name `changed-rule.dmn` is deliberately avoided — it is a pre-existing comparator golden.
- **No placeholders:** every test, fixture, edit, command, and expected outcome is spelled out in full.
