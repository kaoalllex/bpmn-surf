# Layer-2 Phase 4c2: Toolbar / header / modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cover the BPMN differ's toolbar/header surface and viewing modes at Layer-2 (Section F of the gap analysis): the clickable, left-truncating file-path link (FEAT-0026) including the inactive state for an absent version (BUG-0020), the Download button (action + both-absent disable, BUG-0001), the update indicator (FEAT-0012), splitter resize persistence (UX-0007) and hide-properties persistence (BUG-0018) + the show-after-init-hidden non-collapse (BUG-0023), single-row toolbar geometry (BUG-0022) and changes-table max-height (BUG-0021/UX-0005), branch-indicator role words and absent labels (FEAT-0026/UX-0003), and the local-file and rename (BUG-0002) modes.

**Architecture:** Each task adds one `test/e2e/differ-*.spec.js` that boots the real `BpmnDiffer` in Chromium via the existing `bootBpmnDiffer` helper with an in-memory `FakePlatformClient`. The harness loads `src/differ/styles.css` (since Phase 4a), so flex layout and inline styles are real — `boundingBox()` geometry (BUG-0022) and `toHaveCSS` (BUG-0021) are meaningful. **No new fixtures are needed**: every scenario is the default `base.bpmn`/`added-task.bpmn` pair, a one-sided subset of it (absent-side cases), `localFileContent` (local mode), or the same pair with `filePath`/`targetFilePath` overrides (rename). The persistence cases (`localStorage` keys `bpmnDiffer.propsWidth` / `bpmnDiffer.propsHidden`) reload by calling `bootBpmnDiffer` a second time in the same Playwright context (each test gets a fresh, isolated context, so the keys start empty). The update indicator needs the `updateInfo` value, which `BpmnDiffer` reads straight off `rawParams` (`this.#view.setUpdateInfo(this.#rawParams.updateInfo)`) — so it is passed via a `defaultBpmnParams({ updateInfo })` override, **no boot-helper change required**.

**Tech Stack:** Vanilla JS (ES6+), `@playwright/test` (dev-only runner), `node:test` (unit, unaffected), the existing Layer-2 harness (`test/e2e/harness/differ-harness.html`, `test/e2e/support/boot-differ.js`, `fake-platform-client.js`, `static-server.js`).

## Global Constraints

- Vanilla JS (ES6+), no build step, **no new runtime dependencies**; `@playwright/test` is the already-agreed dev dependency. (CLAUDE.md)
- E2E files are named `*.spec.js` — **never** `*.test.js`. (docs/testing.md, playwright.config.js)
- `npm test` (unit) stays unit-only and fast; e2e is the separate `npm run test:e2e`. (docs/testing.md)
- All code comments and docs are in **English only**. (CLAUDE.md)
- **master is protected** — do all work on a feature branch (`feature/e2e-phase4c2`); completing the work = push the branch + open an MR (skill `mr`, with `--remove-source-branch`) after green tests, without separate permission. Merge is the human's. (CLAUDE.md, docs/git-workflow.md)
- This plan adds **tests only** — **no production `src/` changes**, no new fixtures, so neither the DMN side nor the shared differ-page classes are touched.
- **Characterization tests of shipped behaviour**: expected to PASS once written. A RED on an existing-behaviour assertion is a real finding — do **not** loosen it, do **not** touch `src/`; investigate with superpowers:systematic-debugging. The ONE allowed exception: a red that exposes a genuine bug is the user's call — surface the finding with options and, only if confirmed, file a BUG issue per `docs/issues/README.md`, make the minimal `src/` fix, and pin it (as BUG-0025 was handled in 4b).

**⚠️ FIXTURE NAME-COLLISION CHECK:** this plan adds **no fixtures**. Do not create any. If a task tempts you to add one, stop — every scenario here is expressible from the existing `base.bpmn`/`added-task.bpmn` exports plus params.

---

## Reference — verified facts (from `bpmn-differ-view.js`, `bpmn-differ.js`, `branch-indicator.js`, `update-indicator.js`, `diagram-versions.js`, `differ-params.js`, `fake-platform-client.js`)

> **Errata (corrected post-execution, 2026-06-29 — these facts were wrong as originally written; the shipped specs and this doc now reflect reality):**
> 1. **FEAT-0012 `popupUrl` must target the harness origin `http://localhost:4173`** (the static server runs only on 4173 per `playwright.config.js` `baseURL`). A port-80 URL is unreachable → the popup lands on `chrome-error://` and `popup.url()` is non-deterministic.
> 2. **The toolbar Close control must be located with `getByTitle('Close', { exact: true })`** — since 4c1 the search panel adds a `title="Close (Esc)"` button, so the default substring match collides (Playwright strict-mode error).
> 3. **The single-row toolbar guarantee (BUG-0022) must compare vertical CENTERS (`y + height/2`), not bounding-box tops.** `.differ-toolbar` is `flex-wrap:nowrap; align-items:center`, so controls of differing heights (file-path `<a>` ~22px vs buttons ~34px) have tops ~6px apart on a single row; a tops-based `<= 4` is factually wrong. Centers coincide (~1px) on one row while a wrapped row's center is ~34px off, so a tight `<= 4` on centers both passes and still guards wrap.

**IDs / classes / titles (stable selectors):**
- Props panel inner div id: `bpmnProps_12345bf3d4e842caa0d88194431197c0` (`BpmnDifferView.PROPS_ID`). Canvas cell id: `bpmnCanvas_12345bf3d4e842caa0d88194431197c0`.
- File path: `<a class="differ-file-path" target="_blank" rel="noopener noreferrer">`; inactive state adds class `differ-file-path-inactive` and removes the `href`.
- Download button: title `Download the file as shown for the current branch`, text `↓`.
- Switch: `<button>` text `Switch branch` (`getByRole('button', { name: 'Switch branch' })`).
- Highlight: title `Turn diff highlight on` / `Turn diff highlight off`, text `☼`/`☀`.
- Zoom/fit: titles `Zoom in` / `Zoom out` / `Fit view`. Close: title `Close`, text `✕` (⚠️ since 4c1 the search panel adds a `Close (Esc)` button → `getByTitle('Close')` substring-matches both; use `{ exact: true }`).
- Hide-properties button: text `Hide properties` ⇄ `Show properties`.
- Update indicator: `<button class="differ-btn differ-update-indicator">`, text `🔔 v${latestVersion}`, title `Update available for bpmn-surf — open the update window`.
- Splitter: `<td class="differ-splitter" title="Drag to resize the properties panel">`.
- Changes table: `<table class="table-fixed-header changes-table">`, wrapped in a `<div style="max-height:250px; overflow-y:auto">` (BUG-0021). Footer counter cells live in the footer `<table>`; the body `<div>` is `display:none` until "Show changes".
- Toolbar container: `<div class="differ-toolbar">` (flex). Button groups: `<div class="differ-btn-group">`. The branch indicator is a **classless `<span>`** (fontSize 20px, fontWeight bold) inside its group — locate it by text.

**File path (FEAT-0026 / BUG-0020), `BpmnDifferView.setShownFile` + `BpmnDiffer#shownFileFor`:**
- `LRM = '‎'` is prefixed to the **textContent** only: `textContent = '‎' + (path || fileName)`. The **title** is the bare path (no LRM): `title = path || fileName`.
- `url` from `#shownFileFor(targetSide)`: `ref && exists ? client.blobFileUrl(ref, path) : null`, where `ref` = sourceRef (MR side) / targetRef (target side), `exists` = mrXml / branchXml, `path` = filePath / targetFilePath.
- url present → `href` set, `differ-file-path-inactive` removed. url null → `href` removed, `differ-file-path-inactive` added.
- `FakePlatformClient.blobFileUrl(ref, filePath)` → `` `http://localhost/blob/${ref}/${filePath}` `` (no line → no `#L`).
- MR side default → `http://localhost/blob/mr-sha/diagram.bpmn`. Target side default → `http://localhost/blob/base-sha/diagram.bpmn`.
- Absent side (`#showAbsentSide`) calls `setShownFile(#shownFileFor(side))` with `exists` falsy → url null → inactive (BUG-0020).

**Download, `DiagramVersions.download` + `BpmnDiffer#downloadShownBranchFile`:**
- Builds a `Blob`, an `<a download="${branchName}-${fileName}">`, appends, `.click()`s, removes. In Playwright this fires a `download` event with `suggestedFilename() === "${branchName}-${fileName}"`.
- MR side shown: `branchName = sourceLabel ('feature')`, `fileName ('diagram.bpmn')` → `feature-diagram.bpmn`. Target side: `targetLabel ('master')`, `targetFileName ('diagram.bpmn')` → `master-diagram.bpmn`.
- Both-absent (BUG-0001): `show()` calls `showEmptyState(...)` then `setDownloadButtonEnabled(false)` → the Download button is `disabled`.

**Update indicator (FEAT-0012), `UpdateIndicator` + `BpmnDifferView#appendUpdateIndicator`:**
- `BpmnDiffer#init` does `this.#view.setUpdateInfo(this.#rawParams.updateInfo)`. `isAvailable()` requires `updateInfo.updateAvailable && updateInfo.latestVersion`.
- Available → a button is appended; click → `window.open(updateInfo.popupUrl, '_blank')`. Not available (null/undefined/falsy) → `createElement` returns null → nothing appended.

**Splitter / hide persistence (UX-0007 / BUG-0018 / BUG-0023):**
- `PROPS_WIDTH_KEY = 'bpmnDiffer.propsWidth'`, `PROPS_HIDDEN_KEY = 'bpmnDiffer.propsHidden'`. Default width 340, min 250, max `round(0.8 * innerWidth)`.
- Splitter drag: `mousedown` on the splitter → document `mousemove` sets `width = clamp(innerWidth - clientX)` on the props `<td>` → `mouseup` persists `parseInt(td.style.width)` to localStorage and refits. Dragging the splitter **left** widens the panel.
- `#restorePropsWidth` (on build) applies the clamped saved width to the props `<td>` as `width + 'px'`.
- Hide toggle persists `'1'`/`'0'` to `PROPS_HIDDEN_KEY`. `#restorePropsHidden` (on build) reads `'1'` → `#applyPropsHidden(true)` → props `<td>` + splitter `display:none`, button text `Show properties`.
- BUG-0023: the old `max-height:0` collapse was removed; scrolling is owned by the props cell's absolutely-positioned inner div. So showing the panel after it loaded hidden must render real content (non-zero height).

**Branch indicator (FEAT-0026 / UX-0003), `BranchIndicator`:**
- Roles: `TARGET_ROLE='Original'`, `SOURCE_ROLE='Changed'`, `LOCAL_ROLE='Local'` (when constructed with `isLocalSource=true`, i.e. `localFileContent` present). Label text = `` `${role} · ${label}` `` (middot U+00B7, spaces around it).
- Colours: target `darkred` = `rgb(139, 0, 0)`; source/MR `darkblue` = `rgb(0, 0, 139)`; absent `gray` = `rgb(128, 128, 128)`. Normal label → `font-style: normal`. Absent label → appends `· ${note}`, sets `font-style: italic`, colour gray.
- Absent notes: target side absent → `file does not exist` (new file); source side absent → `file deleted`.

**Modes, `DifferParams` + `BpmnDiffer`:**
- branch-only = `!isSourceVersionDefined()` (no `sourceRef` AND no `localFileContent`): Switch + ☼ constructed disabled, **no footer**; `#showBranch` shows `Original · <targetLabel>` with an active file path (targetRef present). *(Switch/☼/footer already pinned by `differ-highlight-branch-only.spec.js` in 4b; this plan only adds the branch-indicator role + active path assertions.)*
- local-file = `localFileContent` set, `sourceRef` undefined: `isSourceVersionDefined()` true (footer/Switch/☼ enabled); `BranchIndicator` role `Local`; MR/source side path is **inactive** (no sourceRef → url null). `useLocalFileContentAsMr` puts the local content on the MR side; `show()` renders it first.
- rename (BUG-0002) = `targetFilePath !== filePath` (and `targetFileName` derived from `targetFilePath`): source side shows `filePath`/`fileName`, target side shows `targetFilePath`/`targetFileName`. `FakePlatformClient.rawFileUrl` keys by **ref only** (ignores path), so both refs still resolve to their fixture XML regardless of the renamed paths.

## File Structure

New spec files (all under `test/e2e/`), **no new fixtures, no `boot-differ.js` change**:
- `differ-file-path-active.spec.js` — Task 1 (active link, classes, title, LRM, href per side across Switch)
- `differ-file-path-inactive.spec.js` — Task 2 (BUG-0020: inactive on an absent version)
- `differ-download.spec.js` — Task 3 (download action filename; disabled when both-absent, BUG-0001)
- `differ-update-indicator.spec.js` — Task 4 (FEAT-0012: present + click→window.open; absent when no updateInfo)
- `differ-splitter-persist.spec.js` — Task 5 (UX-0007: drag → persist → reload restores width)
- `differ-hide-properties-persist.spec.js` — Task 6 (BUG-0018 persist across reload; BUG-0023 non-collapse on show after init-hidden)
- `differ-layout-geometry.spec.js` — Task 7 (BUG-0022 single-row toolbar tops; BUG-0021 changes-table max-height)
- `differ-branch-indicator.spec.js` — Task 8 (role words + colours; absent labels italic gray; branch-only role)
- `differ-modes.spec.js` — Task 9 (local-file mode; rename BUG-0002)

**Out of scope for 4c2 (deferred):** navigation click flows (dive-in click, handler/correlation badges) → Phase 4d. DMN input/output column add/remove (carried from 4a) → 4d. Suppression of Chrome's native find bar (not observable from the page).

---

### Task 1: File-path link — active state and per-side href across Switch (FEAT-0026)

**Files:**
- Create: `test/e2e/differ-file-path-active.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics` from `./support/boot-differ` (default scenario).
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

const LRM = '‎';

// FEAT-0026: the header file path is a real <a> opening the file in the shown
// version. On the MR side (rendered first) it links to the source ref's blob; the
// textContent is LRM-prefixed (bidi guard for the rtl left-truncating element) and
// the title is the bare path. Switching to the target side rewrites href to the
// target ref's blob. Both sides exist here, so the link is always active (no
// `differ-file-path-inactive`).
test('shows an active file-path link whose href tracks the shown side', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const link = page.locator('a.differ-file-path');
    await expect(link).toBeVisible();

    // MR side: blob URL for the source ref; active; LRM-prefixed text; bare title.
    await expect(link).toHaveAttribute('href', 'http://localhost/blob/mr-sha/diagram.bpmn');
    await expect(link).not.toHaveClass(/differ-file-path-inactive/);
    await expect(link).toHaveAttribute('title', 'diagram.bpmn');
    await expect(link).toHaveAttribute('target', '_blank');
    expect(await link.evaluate((el) => el.textContent)).toBe(LRM + 'diagram.bpmn');

    // Switch to the target/base side: href follows the target ref; still active.
    await page.getByRole('button', { name: 'Switch branch' }).click();
    await expect(link).toHaveAttribute('href', 'http://localhost/blob/base-sha/diagram.bpmn');
    await expect(link).not.toHaveClass(/differ-file-path-inactive/);
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test test/e2e/differ-file-path-active.spec.js`
Expected: PASS. A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-file-path-active.spec.js
git commit -m "test(e2e): cover active file-path link + per-side href (FEAT-0026, Layer-2 4c2)"
```

---

### Task 2: File-path link — inactive on an absent version (BUG-0020)

**Files:**
- Create: `test/e2e/differ-file-path-inactive.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `ADDED_TASK_BPMN` from `./support/boot-differ`.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, ADDED_TASK_BPMN
} = require('./support/boot-differ');

// BUG-0020: new file in the MR (base-sha absent). The MR side links normally;
// switching to the absent target side runs #showAbsentSide → setShownFile with a
// null url (the blob would 404), so the path renders inactive — `href` removed and
// the `differ-file-path-inactive` class added.
test('renders the file path inactive when the shown version is absent', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': ADDED_TASK_BPMN } }   // base-sha missing → new file in MR
    });

    const link = page.locator('a.differ-file-path');
    // MR side present → active link.
    await expect(link).toHaveAttribute('href', 'http://localhost/blob/mr-sha/diagram.bpmn');
    await expect(link).not.toHaveClass(/differ-file-path-inactive/);

    await page.getByRole('button', { name: 'Switch branch' }).click();

    // Absent target side → inactive, non-link path.
    await expect(link).toHaveClass(/differ-file-path-inactive/);
    await expect(link).not.toHaveAttribute('href', /.+/);
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test test/e2e/differ-file-path-inactive.spec.js`
Expected: PASS. A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-file-path-inactive.spec.js
git commit -m "test(e2e): pin inactive file path on absent version (BUG-0020, Layer-2 4c2)"
```

---

### Task 3: Download — action filename, and disabled when both-absent (BUG-0001)

**Files:**
- Create: `test/e2e/differ-download.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams` from `./support/boot-differ` (default scenario for the action; a both-absent scenario for the disable).
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the file with two tests**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, defaultBpmnParams } = require('./support/boot-differ');

const DOWNLOAD_TITLE = 'Download the file as shown for the current branch';

// Clicking Download builds an <a download="${label}-${fileName}"> and clicks it.
// On the MR side (shown first) that is "feature-diagram.bpmn". Playwright surfaces
// this as a `download` event with that suggested filename.
test('downloads the shown side with a branch-prefixed filename', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByTitle(DOWNLOAD_TITLE).click()
    ]);
    expect(download.suggestedFilename()).toBe('feature-diagram.bpmn');
});

// BUG-0001: file absent in both versions → the empty-state placeholder shows and
// Download is disabled (nothing to download on either side).
test('disables Download when the file is absent in both versions', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ sourceRef: 'gone', targetRef: 'gone' })
    });

    await expect(page.locator('.differ-empty-state')).toBeVisible();
    await expect(page.getByTitle(DOWNLOAD_TITLE)).toBeDisabled();
});
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test test/e2e/differ-download.spec.js`
Expected: PASS (both). Playwright accepts downloads by default (`acceptDownloads`). A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-download.spec.js
git commit -m "test(e2e): cover Download action + both-absent disable (BUG-0001, Layer-2 4c2)"
```

---

### Task 4: Update indicator — present + click, absent when no updateInfo (FEAT-0012)

**Files:**
- Create: `test/e2e/differ-update-indicator.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams` from `./support/boot-differ`. `updateInfo` is passed via a `defaultBpmnParams({ updateInfo })` override — `BpmnDiffer` reads it straight off rawParams; no boot-helper change.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the file with two tests**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, defaultBpmnParams } = require('./support/boot-differ');

// FEAT-0012: when params carry updateInfo (updateAvailable + latestVersion), the
// toolbar shows a "🔔 v<version>" button. Clicking it opens the popup URL in a new
// tab (window.open). The differ reads updateInfo straight off rawParams.
test('shows the update indicator and opens the popup on click', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({
            // Port 4173 = harness origin (playwright.config.js baseURL); without it
            // Chromium lands on chrome-error:// and popup.url() is non-deterministic.
            updateInfo: { updateAvailable: true, latestVersion: '1.2.3', popupUrl: 'http://localhost:4173/popup.html' }
        })
    });

    const indicator = page.locator('.differ-update-indicator');
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveText('🔔 v1.2.3');
    await expect(indicator).toHaveAttribute('title', 'Update available for bpmn-surf — open the update window');

    const [popup] = await Promise.all([
        page.waitForEvent('popup'),
        indicator.click()
    ]);
    expect(popup.url()).toContain('popup.html');
});

// No updateInfo → UpdateIndicator.createElement returns null → nothing is added.
test('shows no update indicator when there is no update info', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);   // default params carry no updateInfo

    await expect(page.locator('.differ-update-indicator')).toHaveCount(0);
});
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test test/e2e/differ-update-indicator.spec.js`
Expected: PASS (both). A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-update-indicator.spec.js
git commit -m "test(e2e): cover update indicator present/click/absent (FEAT-0012, Layer-2 4c2)"
```

---

### Task 5: Splitter resize persistence (UX-0007)

**Files:**
- Create: `test/e2e/differ-splitter-persist.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics` from `./support/boot-differ` (default scenario). Reloads by booting twice in the same Playwright context (localStorage persists across `page.goto`; the context is per-test, so it starts empty).
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

const PROPS_ID = '#bpmnProps_12345bf3d4e842caa0d88194431197c0';
const WIDTH_KEY = 'bpmnDiffer.propsWidth';

// UX-0007: dragging the splitter resizes the properties panel and persists the
// width to localStorage; a reload restores it. The props <td> is the parent of the
// props inner div. Dragging the splitter LEFT (smaller clientX) widens the panel
// (width = innerWidth - clientX), so the stored width exceeds the 340px default.
test('persists the dragged properties-panel width across reload', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const propsCell = page.locator(PROPS_ID).locator('xpath=..');
    const splitter = page.locator('.differ-splitter');
    await expect(splitter).toBeVisible();

    const box = await splitter.boundingBox();
    const cy = box.y + box.height / 2;
    const cx = box.x + box.width / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 80, cy, { steps: 5 });   // drag left → wider panel
    await page.mouse.up();

    const stored = await page.evaluate((k) => localStorage.getItem(k), WIDTH_KEY);
    expect(Number(stored)).toBeGreaterThan(340);

    // Reload (same context → same localStorage): the width is restored on build.
    await bootBpmnDiffer(page);
    const restored = await page.evaluate((k) => localStorage.getItem(k), WIDTH_KEY);
    expect(restored).toBe(stored);
    const width = await page.locator(PROPS_ID).locator('xpath=..').evaluate((el) => el.style.width);
    expect(width).toBe(stored + 'px');
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test test/e2e/differ-splitter-persist.spec.js`
Expected: PASS. If the drag does not move the panel (e.g. the splitter width/position changed in `styles.css`), that is a real layout finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-splitter-persist.spec.js
git commit -m "test(e2e): cover splitter width persistence across reload (UX-0007, Layer-2 4c2)"
```

---

### Task 6: Hide-properties persistence (BUG-0018) + non-collapse on show after init-hidden (BUG-0023)

**Files:**
- Create: `test/e2e/differ-hide-properties-persist.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics` from `./support/boot-differ` (default scenario; reload by booting twice in the same context).
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the test**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

const PROPS_ID = '#bpmnProps_12345bf3d4e842caa0d88194431197c0';
const HIDDEN_KEY = 'bpmnDiffer.propsHidden';

// BUG-0018: an explicit Hide is persisted to localStorage and survives a reload
// (so it carries into a freshly opened dive-in/out tab). BUG-0023: showing the
// panel after it loaded hidden must render real content (no stale max-height:0
// collapse) — the panel becomes visible with a non-zero height.
test('persists Hide across reload and shows non-collapsed content afterwards', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    // Hide → persisted.
    await page.getByRole('button', { name: 'Hide properties' }).click();
    const stored = await page.evaluate((k) => localStorage.getItem(k), HIDDEN_KEY);
    expect(stored).toBe('1');

    // Reload: the panel loads hidden, the toggle reads "Show properties".
    await bootBpmnDiffer(page);
    await expect(page.getByRole('button', { name: 'Show properties' })).toBeVisible();
    await expect(page.locator(PROPS_ID)).toBeHidden();

    // BUG-0023: Show → real, non-collapsed content.
    await page.getByRole('button', { name: 'Show properties' }).click();
    const props = page.locator(PROPS_ID);
    await expect(props).toBeVisible();
    await expect(page.locator('.bio-properties-panel')).toBeVisible();
    const propsBox = await props.boundingBox();
    expect(propsBox.height).toBeGreaterThan(50);
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test test/e2e/differ-hide-properties-persist.spec.js`
Expected: PASS. A red on the BUG-0023 height check would mean the collapse regressed — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-hide-properties-persist.spec.js
git commit -m "test(e2e): cover hide-properties persistence + non-collapse on show (BUG-0018/0023, Layer-2 4c2)"
```

---

### Task 7: Layout geometry — single-row toolbar (BUG-0022) + changes-table max-height (BUG-0021)

**Files:**
- Create: `test/e2e/differ-layout-geometry.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics` from `./support/boot-differ` (default scenario; the footer/changes table exists because there is a diff).
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the file with two tests**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// BUG-0022: the spec asked for a geometric guarantee that the toolbar is a single
// row. The toolbar is `display:flex; flex-wrap:nowrap; align-items:center`
// (styles.css `.differ-toolbar`), so controls of different heights (file-path <a>
// height ~22, buttons height ~34) are vertically CENTER-aligned — their tops
// legitimately differ by ~6px (=(34-22)/2) even in a single row. Tops are the
// wrong metric; vertical centers are the right one. We assert that the centers of
// the download, file path, Switch, Fit and Close controls share a single center
// line within a tight tolerance. A wrapped second row's center would be ~34px off —
// far outside 4px — so this guard still catches BUG-0022 regressions.
test('lays the toolbar controls out on a single row (equal centers)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const centers = [];
    for (const locator of [
        page.getByTitle('Download the file as shown for the current branch'),
        page.locator('a.differ-file-path'),
        page.getByRole('button', { name: 'Switch branch' }),
        page.getByTitle('Fit view'),
        page.getByTitle('Close', { exact: true }) // exact: true — 4c1 added search panel's 'Close (Esc)' button; substring would match both
    ]) {
        const box = await locator.boundingBox();
        centers.push(box.y + box.height / 2);
    }
    const min = Math.min(...centers);
    const max = Math.max(...centers);
    // With align-items:center + flex-wrap:nowrap, every control shares one vertical
    // center line, so centers coincide within ~1px on a single row. If the bar ever
    // wrapped to a second row, that row's center would be ~34px+ off — far outside
    // 4px. Tight center-based tolerance is both robust to height differences AND
    // still catches wrapping (the BUG-0022 guard).
    expect(max - min).toBeLessThanOrEqual(4);
});

// BUG-0021/UX-0005: the changes-table body scrolls within a capped container
// (max-height:250px) so a long table never pushes the footer off-screen. Reveal
// the table, then assert the wrapping div's max-height.
test('caps the changes-table height at 250px', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    await page.getByRole('button', { name: 'Show changes' }).click();
    const table = page.locator('table.changes-table');
    await expect(table).toBeVisible();

    // The wrapping div carries the inline max-height (BUG-0021 needs the unit).
    const wrapper = table.locator('xpath=..');
    await expect(wrapper).toHaveCSS('max-height', '250px');
});
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test test/e2e/differ-layout-geometry.spec.js`
Expected: PASS (both). If the toolbar wraps (tops differ by more than the tolerance) that is exactly the BUG-0022 regression the test guards — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-layout-geometry.spec.js
git commit -m "test(e2e): pin single-row toolbar + changes-table cap (BUG-0022/0021, Layer-2 4c2)"
```

---

### Task 8: Branch indicator — role words, colours, absent labels, branch-only role (FEAT-0026/UX-0003)

**Files:**
- Create: `test/e2e/differ-branch-indicator.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `BASE_BPMN`, `ADDED_TASK_BPMN` from `./support/boot-differ`.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the file with four tests**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, BASE_BPMN, ADDED_TASK_BPMN
} = require('./support/boot-differ');

const DARK_BLUE = 'rgb(0, 0, 139)';
const DARK_RED = 'rgb(139, 0, 0)';
const GRAY = 'rgb(128, 128, 128)';

// Normal mode: the MR side (shown first) reads "Changed · <sourceLabel>" in
// darkblue; switching shows "Original · <targetLabel>" in darkred. The role word
// precedes every label so the side is clear without colour (FEAT-0026).
test('shows role words and side colours, normal then after Switch', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const changed = page.locator('span', { hasText: 'Changed · feature' });
    await expect(changed).toBeVisible();
    await expect(changed).toHaveCSS('color', DARK_BLUE);
    await expect(changed).toHaveCSS('font-style', 'normal');

    await page.getByRole('button', { name: 'Switch branch' }).click();

    const original = page.locator('span', { hasText: 'Original · master' });
    await expect(original).toBeVisible();
    await expect(original).toHaveCSS('color', DARK_RED);
    await expect(original).toHaveCSS('font-style', 'normal');
});

// New file in the MR (target absent): switching to the target side marks the
// absence in the label — "Original · master · file does not exist", italic gray.
test('marks an absent target side as a new file (italic gray)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': ADDED_TASK_BPMN } }   // base-sha absent
    });

    await page.getByRole('button', { name: 'Switch branch' }).click();

    const absent = page.locator('span', { hasText: 'file does not exist' });
    await expect(absent).toBeVisible();
    await expect(absent).toContainText('Original · master · file does not exist');
    await expect(absent).toHaveCSS('color', GRAY);
    await expect(absent).toHaveCSS('font-style', 'italic');
});

// File deleted in the MR (source absent but sourceRef defined): show() renders the
// target first; switching to the source side reads "Changed · feature · file
// deleted", italic gray.
test('marks an absent source side as a deleted file (italic gray)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'base-sha': BASE_BPMN } }   // mr-sha absent (deleted in MR)
    });

    await page.getByRole('button', { name: 'Switch branch' }).click();

    const deleted = page.locator('span', { hasText: 'file deleted' });
    await expect(deleted).toBeVisible();
    await expect(deleted).toContainText('Changed · feature · file deleted');
    await expect(deleted).toHaveCSS('color', GRAY);
    await expect(deleted).toHaveCSS('font-style', 'italic');
});

// Branch-only mode (no sourceRef, no localFileContent): only the target side
// exists, shown as "Original · <targetLabel>", normal (not absent).
test('shows the Original role in branch-only mode', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ sourceRef: undefined, sourceLabel: undefined }),
        fixtures: { xmlByRef: { 'base-sha': BASE_BPMN } }
    });

    const original = page.locator('span', { hasText: 'Original · master' });
    await expect(original).toBeVisible();
    await expect(original).toHaveCSS('color', DARK_RED);
    await expect(original).toHaveCSS('font-style', 'normal');
});
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test test/e2e/differ-branch-indicator.spec.js`
Expected: PASS (all four). A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-branch-indicator.spec.js
git commit -m "test(e2e): cover branch-indicator roles, colours, absent labels (FEAT-0026/UX-0003, Layer-2 4c2)"
```

---

### Task 9: Modes — local-file and rename (BUG-0002)

**Files:**
- Create: `test/e2e/differ-modes.spec.js`

**Interfaces:**
- Consumes: `bootBpmnDiffer`, `wireDiagnostics`, `defaultBpmnParams`, `BASE_BPMN`, `ADDED_TASK_BPMN` from `./support/boot-differ`.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the file with two tests**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, BASE_BPMN, ADDED_TASK_BPMN
} = require('./support/boot-differ');

// Local-file mode: localFileContent set, no sourceRef. isSourceVersionDefined() is
// true (so Switch/footer/☼ are enabled), the source side's role word is "Local"
// (BranchIndicator isLocalSource), and the source file path is INACTIVE — there is
// no sourceRef, so no blob URL exists for the uploaded file.
test('local-file mode: Local role, inactive source path, Switch enabled', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({
            sourceRef: undefined,
            localFileContent: ADDED_TASK_BPMN,
            sourceLabel: 'my-local.bpmn'
        }),
        fixtures: { xmlByRef: { 'base-sha': BASE_BPMN } }
    });

    await expect(page.locator('span', { hasText: 'Local · my-local.bpmn' })).toBeVisible();

    // The local (source) side has no repo ref → inactive, non-link path.
    const link = page.locator('a.differ-file-path');
    await expect(link).toHaveClass(/differ-file-path-inactive/);
    await expect(link).not.toHaveAttribute('href', /.+/);

    // A diff still exists (local vs base), so Switch is enabled.
    await expect(page.getByRole('button', { name: 'Switch branch' })).toBeEnabled();
});

// Rename mode (BUG-0002): targetFilePath differs from filePath, so the two sides
// show different paths/names. The source side shows the new path; switching shows
// the target side's old path. blobFileUrl is keyed by ref+path, so the hrefs differ
// in both ref and path.
test('rename mode: each side keeps its own path/name (BUG-0002)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({
            filePath: 'new-name.bpmn',
            fileName: 'new-name.bpmn',
            targetFilePath: 'old-name.bpmn'
        })
        // default fixtures: base-sha + mr-sha both resolve (fake keys by ref only)
    });

    const link = page.locator('a.differ-file-path');
    // MR side: the new path.
    await expect(link).toHaveAttribute('title', 'new-name.bpmn');
    await expect(link).toHaveAttribute('href', 'http://localhost/blob/mr-sha/new-name.bpmn');

    await page.getByRole('button', { name: 'Switch branch' }).click();

    // Target side: the old path/name (BUG-0002 — the target keeps its pre-rename name).
    await expect(link).toHaveAttribute('title', 'old-name.bpmn');
    await expect(link).toHaveAttribute('href', 'http://localhost/blob/base-sha/old-name.bpmn');
});
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test test/e2e/differ-modes.spec.js`
Expected: PASS (both). A red is a real finding — investigate, do not loosen.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/differ-modes.spec.js
git commit -m "test(e2e): cover local-file mode + rename BUG-0002 (Layer-2 4c2)"
```

---

## Finalize 4c2

- [ ] **Run the full suites green**

Run: `npm test` → unit suite unchanged & green.
Run: `npm run test:e2e` → all e2e specs green (the 4c1 set plus 14 new tests across 9 new files; no existing spec regressed — this plan adds tests only, no `src/` or fixture changes).

- [ ] **Push + MR** (per CLAUDE.md / docs/git-workflow.md; branch `feature/e2e-phase4c2`)

Use the `mr` skill (push + open MR into master with `--remove-source-branch`). Merge is the human's. Do not push with a red suite.

- [ ] **Update the auto-memory** `layer2-e2e-coverage.md` with a "Phase 4c2 SHIPPED" entry: the 9 new toolbar/header/mode specs, the FEAT-0012 `updateInfo` param pattern, the localStorage-reload-in-same-context pattern, the `boundingBox` single-row geometry pattern, full suite count, and any lessons.
