# E2E Testing — Phase 1 (Foundation + Proof) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Layer-2 (differ-component) test harness — driving the real differ in a real Chromium with an injected fake platform client — and prove it with a boot/render smoke test, after a behavior-preserving DI refactor of both differ orchestrators.

**Architecture:** The differ orchestrators stop building their own `PlatformClient`; the factory call moves to the bootstrap `main()` and the client is injected via a required constructor parameter (mirrors the content scope's `App` + `repo-provider-factory`). Layer-2 tests then construct `new BpmnDiffer(rawParams, fakeClient)` directly in a real Chromium page, loading the real differ scripts via the production `loadScripts`, with all data served in-memory by a `FakePlatformClient` (diagram XML via `data:` URLs, search/changes via canned arrays) — fully offline, no network interception.

**Tech Stack:** Vanilla JS (ES6+), `@playwright/test` (real Chromium), a tiny Node static file server, the existing `node:test` + jsdom unit suite (unchanged).

**Spec:** `docs/superpowers/specs/2026-06-25-e2e-testing-design.md`

## Global Constraints

- Vanilla JS (ES6+); **no build step** for the extension. Playwright is a dev-only test runner, not a build step.
- New runtime dependencies forbidden; dev dependency `@playwright/test` is the approved addition this plan introduces.
- `npm test` stays **unit-only** (`node --test 'test/**/*.test.js'`, ~0.5 s) and unchanged. E2E is a separate command.
- E2E test files are named `*.spec.js` (never `*.test.js`) so the `node:test` glob `test/**/*.test.js` ignores them.
- Shared differ-page changes apply to **both** `BpmnDiffer` and `DmnDiffer`.
- Phase 1 adds **no `src/` files** (only `test/e2e/` + root config), so the structural tests (`test/structure/*`) are unaffected.
- master is protected: work on the feature branch; commits are minimalist, **without** `Co-Authored-By` and without tool/author mentions.
- `utils.js` declares top-level `const fileCache` / `const FILE_CACHE_MAX_ENTRIES`, so it must be loaded **exactly once** per page (a second load throws "already declared").

---

### Task 1: Inject the platform client into both differ orchestrators (refactor)

Behavior-preserving refactor: `platformClient` becomes a required constructor parameter; `createPlatformClient(...)` moves from `#init()` to `main()`. The orchestrator no longer chooses the client.

**Files:**
- Modify: `src/differ/bpmn/bpmn-differ.js` (constructor ~62-64, `#init()` ~226-231, `main()` ~759-773)
- Modify: `src/differ/dmn/dmn-differ.js` (constructor ~24-26, `#init()` ~63-69, `main()` ~338-352)
- Safety net: `test/differ/bpmn/bpmn-differ.test.js` (existing; must stay green, no edit expected)

**Interfaces:**
- Produces: `new BpmnDiffer(rawParams, platformClient)` and `new DmnDiffer(rawParams, platformClient)` — `platformClient` is any object implementing the `PlatformClient` interface (`src/differ/platform/platform-client.js`). Task 3 consumes this signature.

- [ ] **Step 1: Confirm the baseline is green**

Run: `npm test`
Expected: PASS (all unit + structural tests). This is the refactor's safety net.

- [ ] **Step 2: Edit `src/differ/bpmn/bpmn-differ.js` — constructor**

Replace:

```js
    constructor(rawParams) {
        this.#rawParams = rawParams;
    }
```

with:

```js
    // platformClient (the differ-scope PlatformClient seam, REFAC-0004) is built
    // by the bootstrap main() and injected here — the orchestrator no longer
    // chooses the client, mirroring content-scope App + repo-provider-factory.
    constructor(rawParams, platformClient) {
        this.#rawParams = rawParams;
        this.#platformClient = platformClient;
    }
```

- [ ] **Step 3: Edit `src/differ/bpmn/bpmn-differ.js` — `#init()`**

Replace:

```js
        this.#params = new DifferParams(this.#rawParams);
        this.#params.requirePlatformInfo();
        // The differ-scope seam (REFAC-0004): all platform-specific URL/search/
        // changes access goes through this client, chosen by platform.kind.
        this.#platformClient = createPlatformClient(this.#params.platform);

        this.#versions = new DiagramVersions(this.#params, this.#platformClient);
```

with:

```js
        this.#params = new DifferParams(this.#rawParams);
        this.#params.requirePlatformInfo();

        this.#versions = new DiagramVersions(this.#params, this.#platformClient);
```

- [ ] **Step 4: Edit `src/differ/bpmn/bpmn-differ.js` — `main()`**

Replace:

```js
        console.debug('showing bpmn differ...');
        await new BpmnDiffer(msg.data.params).show();
```

with:

```js
        console.debug('showing bpmn differ...');
        const rawParams = msg.data.params;
        const platformClient = createPlatformClient(rawParams.platform);
        await new BpmnDiffer(rawParams, platformClient).show();
```

- [ ] **Step 5: Edit `src/differ/dmn/dmn-differ.js` — constructor**

Replace:

```js
    constructor(rawParams) {
        this.#rawParams = rawParams;
    }
```

with:

```js
    // platformClient (the differ-scope PlatformClient seam, REFAC-0004) is built
    // by the bootstrap main() and injected here — the orchestrator no longer
    // chooses the client, mirroring content-scope App + repo-provider-factory.
    constructor(rawParams, platformClient) {
        this.#rawParams = rawParams;
        this.#platformClient = platformClient;
    }
```

- [ ] **Step 6: Edit `src/differ/dmn/dmn-differ.js` — `#init()`**

Replace:

```js
        this.#params = new DifferParams(this.#rawParams);
        // The back navigation (FEAT-0005) calls the platform API to find callers.
        this.#params.requirePlatformInfo();
        // The differ-scope seam (REFAC-0004): all platform-specific URL/search/
        // changes access goes through this client, chosen by platform.kind.
        this.#platformClient = createPlatformClient(this.#params.platform);

        this.#versions = new DiagramVersions(this.#params, this.#platformClient);
```

with:

```js
        this.#params = new DifferParams(this.#rawParams);
        // The back navigation (FEAT-0005) calls the platform API to find callers.
        this.#params.requirePlatformInfo();

        this.#versions = new DiagramVersions(this.#params, this.#platformClient);
```

- [ ] **Step 7: Edit `src/differ/dmn/dmn-differ.js` — `main()`**

Replace:

```js
        console.debug('showing dmn differ...');
        await new DmnDiffer(msg.data.params).show();
```

with:

```js
        console.debug('showing dmn differ...');
        const rawParams = msg.data.params;
        const platformClient = createPlatformClient(rawParams.platform);
        await new DmnDiffer(rawParams, platformClient).show();
```

- [ ] **Step 8: Verify no regression**

Run: `npm test`
Expected: PASS. `bpmn-differ.test.js` only asserts `BpmnDiffer.EDIT_EVENTS` and never instantiates the class; `main()` references `createPlatformClient` only inside the (un-invoked) message handler, so loading the file in the vm context still does not throw.

- [ ] **Step 9: Quick syntax check**

Run: `node --check src/differ/bpmn/bpmn-differ.js && node --check src/differ/dmn/dmn-differ.js`
Expected: no output (exit 0).

- [ ] **Step 10: Commit**

```bash
git add src/differ/bpmn/bpmn-differ.js src/differ/dmn/dmn-differ.js
git commit -m "refactor(differ): make platform client a required constructor dependency"
```

---

### Task 2: Playwright scaffolding + static server

Add the runner, a config, a dependency-free static file server, npm scripts, and a tiny infra smoke test that proves the whole toolchain runs.

**Files:**
- Modify: `package.json` (devDependencies + scripts)
- Create: `playwright.config.js`
- Create: `test/e2e/support/static-server.js`
- Create: `test/e2e/infra.spec.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces: a running static server at `http://localhost:4173` rooted at the repo (so `/src/...`, `/libs/...`, `/test/...` resolve); `npm run test:e2e` runs `@playwright/test` over `test/e2e/**/*.spec.js`. Task 3 consumes both.

- [ ] **Step 1: Install the runner and browser**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

Expected: `@playwright/test` appears in `package.json` devDependencies and `package-lock.json`; Chromium downloads to Playwright's global cache (not the repo).

- [ ] **Step 2: Create the static server `test/e2e/support/static-server.js`**

```js
'use strict';

// Minimal static file server rooted at the repo root, for the e2e harness.
// Serves src/, libs/, test/ over http so the differ scripts load with correct
// MIME types (a file:// origin trips Chromium's subresource rules). Started and
// stopped by Playwright's webServer config; the port is argv[2] (default 4173).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const PORT = Number(process.argv[2]) || 4173;

const MIME = {
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.html': 'text/html; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.png': 'image/png'
};

http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = path.join(ROOT, path.normalize(urlPath));
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403).end('forbidden');
        return;
    }
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404).end('not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
    });
}).listen(PORT, () => console.log(`static server on http://localhost:${PORT}`));
```

- [ ] **Step 3: Create `playwright.config.js`**

```js
'use strict';

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './test/e2e',
    testMatch: '**/*.spec.js',
    fullyParallel: true,
    reporter: [['list'], ['html', { outputFolder: 'test-results/html', open: 'never' }]],
    use: {
        baseURL: 'http://localhost:4173',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    webServer: {
        command: 'node test/e2e/support/static-server.js 4173',
        port: 4173,
        reuseExistingServer: !process.env.CI,
        timeout: 30000
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
    ]
});
```

- [ ] **Step 4: Add npm scripts to `package.json`**

In the `"scripts"` object, after `"test": ...`, add:

```json
        "test:e2e": "playwright test",
        "test:e2e:ui": "playwright test --ui",
        "test:e2e:headed": "playwright test --headed",
```

- [ ] **Step 5: Ignore Playwright output in `.gitignore`**

Append these lines:

```
test-results/
playwright-report/
```

- [ ] **Step 6: Write the infra smoke test `test/e2e/infra.spec.js`**

```js
'use strict';

const { test, expect } = require('@playwright/test');

test('static server serves repo files over http', async ({ page }) => {
    const response = await page.goto('/src/core/utils.js');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('javascript');
});
```

- [ ] **Step 7: Run it to verify the toolchain works**

Run: `npm run test:e2e`
Expected: PASS — Playwright launches Chromium, the webServer starts the static server, and the single test passes.

- [ ] **Step 8: Confirm the unit suite still ignores e2e files**

Run: `npm test`
Expected: PASS, and the run does NOT pick up `infra.spec.js` (it is `*.spec.js`, not `*.test.js`).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json playwright.config.js test/e2e/support/static-server.js test/e2e/infra.spec.js .gitignore
git commit -m "test(e2e): add Playwright scaffolding and static file server"
```

---

### Task 3: Differ harness + FakePlatformClient + boot/render smoke test

Boot the real BPMN differ in Chromium with an injected fake client and assert it renders.

**Files:**
- Create: `test/e2e/harness/differ-harness.html`
- Create: `test/e2e/support/fake-platform-client.js`
- Create: `test/e2e/differ-boot.spec.js`
- Reuse: `test/fixtures/base.bpmn`, `test/fixtures/added-task.bpmn`, `libs/camunda-bpmn-moddle/resources/camunda.json`

**Interfaces:**
- Consumes: `new BpmnDiffer(rawParams, platformClient)` (Task 1); the static server + `npm run test:e2e` (Task 2).
- Produces: `class FakePlatformClient` with the six `PlatformClient` methods — `rawFileUrl(ref, filePath)`, `blobFileUrl(ref, filePath, line)`, `searchCode(ref, term, options)`, `searchPageUrl(term, ref)`, `prChangedFiles(changeId)`, `prDiffsUrl(changeId)` — constructed as `new FakePlatformClient({ xmlByRef, searchHits, changedFiles })`. Later Phase-1b/2 feature tests reuse the harness helper and this client.

- [ ] **Step 1: Create the blank harness page `test/e2e/harness/differ-harness.html`**

```html
<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <title>differ harness</title>
</head>
<body></body>
</html>
```

- [ ] **Step 2: Create `test/e2e/support/fake-platform-client.js`**

```js
'use strict';

// Test-only PlatformClient (the differ-scope seam — see
// src/differ/platform/platform-client.js). Returns in-memory fixtures so the
// differ runs fully offline: rawFileUrl yields a data: URL that the global
// loadFileContent fetches locally; search/changes return canned arrays. Loaded
// into the harness page via a <script> tag, so it defines a global class.
class FakePlatformClient {
    // { xmlByRef: { [ref]: xmlString }, searchHits: [...], changedFiles: [...] }
    constructor({ xmlByRef = {}, searchHits = [], changedFiles = [] } = {}) {
        this._xmlByRef = xmlByRef;
        this._searchHits = searchHits;
        this._changedFiles = changedFiles;
    }

    rawFileUrl(ref, filePath) {
        const xml = this._xmlByRef[ref];
        // An unknown ref → empty content; loadFileContent returns '' (falsy), which
        // the differ treats as "file absent in this version" (BUG-0001 path).
        return 'data:application/xml,' + encodeURIComponent(xml || '');
    }

    blobFileUrl(ref, filePath, line) {
        return `http://localhost/blob/${ref}/${filePath}` + (line ? `#L${line}` : '');
    }

    async searchCode(ref, term, options = {}) {
        return this._searchHits;
    }

    searchPageUrl(term, ref) {
        return `http://localhost/search?term=${encodeURIComponent(term)}`;
    }

    async prChangedFiles(changeId) {
        return this._changedFiles;
    }

    prDiffsUrl(changeId) {
        return `http://localhost/mr/${changeId}/diffs`;
    }
}
```

- [ ] **Step 3: Write the boot/render smoke test `test/e2e/differ-boot.spec.js`**

```js
'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

const baseBpmn = read('test/fixtures/base.bpmn');
const addedTaskBpmn = read('test/fixtures/added-task.bpmn');
const camundaModdle = require(path.join(ROOT, 'libs/camunda-bpmn-moddle/resources/camunda.json'));

// Boots the real BPMN differ in the page with an injected fake client.
async function bootBpmnDiffer(page, { params, fixtures }) {
    await page.goto('/test/e2e/harness/differ-harness.html');

    // Load utils.js ONCE (defines loadScripts / loadFileContent). The real
    // loadScripts below re-includes utils.js, but a second load would throw
    // ("const fileCache already declared"), so neutralize that one re-load with
    // an empty data: script. Every other differ script loads fresh into the
    // blank page, exactly as in production.
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

test('boots the BPMN differ and renders the diagram', async ({ page }) => {
    // Surface page errors and console output in the test log (the trace also
    // captures them on failure — see playwright.config.js).
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));
    page.on('console', (msg) => {
        if (msg.type() === 'error') console.log('[console.error]', msg.text());
    });

    const params = {
        platform: { kind: 'fake', projectUrl: 'http://localhost/p', hostUrl: 'http://localhost', projectId: '1' },
        sourceRef: 'mr-sha',
        sourceLabel: 'feature',
        targetRef: 'base-sha',
        targetLabel: 'master',
        filePath: 'diagram.bpmn',
        fileName: 'diagram.bpmn',
        camundaBpmnModdle: camundaModdle
    };
    const fixtures = { xmlByRef: { 'base-sha': baseBpmn, 'mr-sha': addedTaskBpmn } };

    await bootBpmnDiffer(page, { params, fixtures });

    // Toolbar with the primary action rendered.
    await expect(page.locator('.differ-toolbar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch branch' })).toBeVisible();

    // bpmn-js actually rendered the diagram into the canvas cell (showCanvas()
    // flips its visibility once rendering is done).
    const canvas = page.locator('#bpmnCanvas_12345bf3d4e842caa0d88194431197c0');
    await expect(canvas).toBeVisible();
    await expect(canvas.locator('svg .djs-element').first()).toBeVisible();
});
```

- [ ] **Step 4: Run the boot test**

Run: `npm run test:e2e`
Expected: PASS — the differ toolbar renders, "Switch branch" is visible, and at least one bpmn-js shape (`svg .djs-element`) is rendered in the canvas.

- [ ] **Step 5: If it fails, inspect the artifacts (do not guess)**

Run: `npx playwright show-trace test-results/**/trace.zip` (or open `test-results/html`)
Look at: the assertion message (expected vs actual), the `[pageerror]`/`[console.error]` lines in the run log, the screenshot, and the per-step DOM snapshot. Fix the cause in the plugin code or the harness, then re-run Step 4.

- [ ] **Step 6: Confirm the unit suite is still green and untouched**

Run: `npm test`
Expected: PASS (the e2e `*.spec.js` files are not picked up).

- [ ] **Step 7: Commit**

```bash
git add test/e2e/harness/differ-harness.html test/e2e/support/fake-platform-client.js test/e2e/differ-boot.spec.js
git commit -m "test(e2e): boot the BPMN differ with a fake platform client"
```

---

## Deferred to the next plans (not Phase 1)

- **Layer-2 feature tests** (diff highlight colors, switch-branch, changes table + row click, sequenceFlow conditions in the properties panel, Ctrl/Cmd+F search, dive-in overlays, empty/absent states, view-only copy invariants) and a DMN boot test — they reuse this harness and `FakePlatformClient`, and are written against the proven (green) harness so their exact DOM/marker assertions can be verified live rather than guessed. (Spec Phase 2.)
- **Layer 3 (full e2e with the loaded extension + synthetic GitLab pages).** (Spec Phase 3; carries the MV3-headless risk to validate first.)

## Self-Review

**Spec coverage (Phase 1 scope):**
- DI seam (required param, factory → bootstrap, both differs) → Task 1. ✓
- `@playwright/test` runner + config + `trace: retain-on-failure` + `screenshot: only-on-failure` + HTML report → Task 2 / Task 3. ✓
- `npm test` unit-only, e2e separate, `*.spec.js` naming → Global Constraints + Task 2 Steps 7-8. ✓
- Reuse the real `loadScripts` with the utils.js double-load neutralized → Task 3 Step 3. ✓
- `FakePlatformClient` with `data:`-URL content, canned search/changes → Task 3 Step 2. ✓
- Diagram content from existing `test/fixtures/` → Task 3 (base.bpmn / added-task.bpmn). ✓
- AI-friendly artifacts (trace, screenshot, console/pageerror) → Task 3 Steps 3, 5. ✓
- Feature tests + Layer 3 explicitly deferred (spec Phases 2-3) → "Deferred" section. ✓

**Placeholder scan:** No TBD/TODO; every code step shows the full file content or the exact before/after. ✓

**Type consistency:** `FakePlatformClient` implements the six `PlatformClient` method names/arities verbatim (`rawFileUrl`, `blobFileUrl`, `searchCode`, `searchPageUrl`, `prChangedFiles`, `prDiffsUrl`). The constructor signature `new BpmnDiffer(rawParams, platformClient)` defined in Task 1 matches its use in Task 3. The canvas id `bpmnCanvas_12345bf3d4e842caa0d88194431197c0` matches `BpmnDifferView.CANVAS_ID`. ✓
