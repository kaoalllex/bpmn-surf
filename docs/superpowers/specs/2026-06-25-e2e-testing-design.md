# Design: automated UI/integration testing for bpmn-surf

Date: 2026-06-25
Status: approved design (pre-implementation)

## Problem

After every fix or feature, the only way to verify the extension end-to-end is
manual: load the unpacked extension, open prepared/old GitLab merge requests,
click buttons and eyeball the result (see the "Manual checking" section of
`docs/testing.md`). This is slow, covers only a fraction of the surface, and a
large part of the behavior is *visual* — button placement and appearance,
diff highlighting, toolbar layout — which today nobody checks systematically.

We want this verification fully automated, runnable **locally and offline**
(no corporate GitLab/GitHub access required), and **AI-friendly**: when a test
fails, the failure output alone must let a human *or* an agent diagnose and fix
the cause in the plugin code — without the agent being part of the test run.

## Goals

- Automate both surfaces the manual checklist exercises:
  1. the GitLab-page content script (file detection, button injection,
     placement, accent styling, providers, platform detection);
  2. the differ tab (diagram rendering, diff highlighting, toolbar layout,
     properties panel, changes table, search, navigation).
- Run fully offline and deterministically, with no access to a corporate
  GitLab/GitHub.
- Both targeted (per-feature) and large (e2e/integration) tests.
- Self-contained, deterministic test runs: `npm run test:e2e` lists which tests
  failed plus assertion text and artifact paths. **No LLM/agent inside the run.**
- Rich, machine-readable failure artifacts (assertion text, Playwright trace,
  screenshot, console logs) consumed *after the fact* by a human or an agent.

## Non-goals

- No pixel-snapshot visual regression by default (flaky across OS/fonts, poorly
  "fixable" from a pixel diff). May be added later for a couple of stable
  screens if wanted.
- No AI-vision assertions *inside* tests. AI vision, if ever used, is a separate
  optional tool a human/agent runs against saved screenshots — never a gate.
- No live corporate GitLab in the loop. A real-GitLab "smoke" run, if ever
  needed, is a separate, occasional, manual job — not part of the default set.
- No Docker GitLab CE and no public-sandbox dependency in the default set.

## Constraints (from the project)

- Vanilla JS (ES6+), no build step for the extension, no new *runtime*
  dependencies. Playwright is a *dev* dependency and a separate test runner; it
  does not add a build step to the extension. Adding it is the explicit
  agreement this design requests (dev deps are by agreement).
- `npm test` (unit, `node:test` + jsdom, ~0.5 s) stays the fast loop and is
  unchanged. E2E is a separate command.
- Shared differ-page classes are used by both BPMN and DMN differ: changes to
  them (the DI seam below) must be applied to both orchestrators.
- master is protected; this work lands via feature branches and MRs.

## Resolved decisions

1. **Backend = network interception + local fixtures.** Playwright intercepts
   all requests to the GitLab host and fulfills them from captured fixtures
   (page HTML, API JSON, raw BPMN/DMN, search results). No server beyond a tiny
   local static file server, no Docker. Docker GitLab CE and public sandboxes
   are explicitly deferred.
2. **Visual checks = deterministic gate (DOM + computed styles + geometry) plus
   screenshots/traces/console as artifacts.** No AI vision and no pixel
   snapshots in the gate.
3. **Layer 2 (differ component tests) = a fake platform client**, injected into
   the real differ as a **required** constructor parameter (the factory moves to
   the bootstrap, so the orchestrator no longer chooses the client); Layer 3
   (full e2e) = the real `GitLabPlatformClient` driven against intercepted
   fixtures.
4. **Driver/runner = `@playwright/test`** (real Chromium, MV3 extension
   loading, network interception, trace/screenshot/HTML report out of the box).
5. **No separate backlog issue** — this spec is the record.

## Why the differ can be driven with a fake provider

The differ is already provider-agnostic at a single seam introduced by
REFAC-0004: `PlatformClient` (`src/differ/platform/platform-client.js`), with
six methods — `rawFileUrl`, `blobFileUrl`, `searchCode`, `searchPageUrl`,
`prChangedFiles`, `prDiffsUrl`. The concrete client is injected via constructors
(DI) into `DiagramVersions` and every navigation locator (`CallActivityLocator`,
`DecisionLocator`, `CallerLocator`, `HandlerLocator`, `CorrelationLocator`).
Search hits are normalized to `{path, line, snippet}` so no platform JSON
reaches the locators. A `FakePlatformClient` implementing those six methods is
therefore a clean way to feed the differ, independent of any real platform.

Two honest caveats (verified in code):

- **`ProcessFileIndex` is deliberately still GitLab-specific.** In
  `BpmnDiffer.#init()` (`src/differ/bpmn/bpmn-differ.js:242-247`) it is built
  directly from `platform.projectUrl/hostUrl/projectId`, bypassing the client —
  by design, as the "doomed" fallback path of Call Activity resolution. It
  affects only the *fallback* path (the primary path goes through the client).
  Layer-2 tests do not provoke it; it is out of scope until removed.
- **The client is currently built inside the orchestrator**, not passed in:
  `createPlatformClient(this.#params.platform)` at
  `src/differ/bpmn/bpmn-differ.js:231`. This design moves that call up to the
  bootstrap so the orchestrator receives the client via DI (see the seam below)
  — mirroring the content scope, where `App` receives providers assembled by
  `repo-provider-factory` and never builds them itself.

**Content loading is separate from the client.** `DiagramVersions` fetches XML
via the global `loadFileContent(client.rawFileUrl(...))`; the client only builds
the URL, and `loadFileContent` is a plain `fetch(url).text()` with a cache
(`src/core/utils.js:23`). So a fake client whose `rawFileUrl` returns a
`data:` URL embedding the fixture XML makes content load locally with **no
network and no interception**; `searchCode`/`prChangedFiles` return canned
arrays (no fetch at all). Layer 2 is thus fully offline without Playwright route
interception.

Bonus invariant guard: because the fake supplies no GitLab fields or URLs, any
future leak of provider specifics into the differ core would break the Layer-2
tests — so they actively enforce the "universal differ" property and will keep
validating the differ once GitHub/Bitbucket clients arrive.

## Architecture: three layers

| Layer | Location | Covers | Environment |
|-------|----------|--------|-------------|
| 1. Unit (exists) | `test/**` (`node:test` + jsdom) | Pure logic: comparators, parsers, providers in isolation | Node, ~0.5 s. Unchanged |
| 2. Differ component (new) | `test/e2e/` | Differ rendering: diff highlight + colors, switch branch, changes table + row click, conditions in the properties panel, zoom/pan/fit, hide properties, search (Ctrl/Cmd+F), dive-in overlays, empty/absent states, view-only invariants (BUG-0011…0015: editing blocked yet select+copy works) | Real Chromium, **fake client**, offline |
| 3. Full e2e (new) | `test/e2e/` | Content-script side: file detection, button injection + placement + accent + geometry, click → differ tab opens, end-to-end smoke. Real `GitLabPlatformClient` | Real extension in Chromium + network interception from fixtures |

Targeted per-feature tests live mostly in Layer 2 (cheap). Large cross-cutting
flows live in Layer 3 (few, slower). Each test is tagged with its feature/bug id
(`FEAT-xxxx` / `BUG-xxxx`) so a failure points at the feature.

## Layer 2 — differ component harness

- **Reuse the real `loadScripts`.** The harness page
  (`test/e2e/harness/differ-harness.html`) calls the production
  `utils.js#loadScripts(document, getLocalUrl)` with
  `getLocalUrl(name) → http://localhost/<name>`. This keeps script order and
  composition automatically in sync with production (no duplicated `<script>`
  list to drift).
- **Tiny static server.** Playwright's `webServer` config serves the repository
  root so `libs/` and `src/` load over `http://localhost`.
- **Drive directly, bypassing postMessage.** A test runs, in `page.evaluate`,
  `new BpmnDiffer(params, fakeClient).show()` (and `DmnDiffer` likewise).
- **`FakePlatformClient`** (`test/e2e/support/fake-platform-client.js`)
  implements the six interface methods: `rawFileUrl` → a `data:` URL carrying a
  fixture XML; `searchCode`/`prChangedFiles` → canned arrays;
  `blobFileUrl`/`searchPageUrl`/`prDiffsUrl` → synthetic strings.
- **Production change (small, behavior-preserving): a required constructor DI
  parameter** on both `BpmnDiffer` and `DmnDiffer`, with the factory call moved
  up to the bootstrap. The orchestrator no longer decides which client to use —
  it receives one, mirroring the content scope's `App`/`repo-provider-factory`
  split.

  ```js
  // constructor: (rawParams, platformClient)  — required, no default
  // #init(): this.#platformClient = platformClient;  // drop the createPlatformClient(...) call

  // main() (the differ-scope composition root):
  const client = createPlatformClient(rawParams.platform);
  await new BpmnDiffer(rawParams, client).show();
  ```

  Only two call sites change (one `main()` per orchestrator; nested differs open
  in a new tab with their own `main()`). `createPlatformClient(rawParams.platform)`
  is equivalent to today's `createPlatformClient(this.#params.platform)` — the
  `platform` descriptor passes through `rawParams` verbatim and the factory reads
  only `platform.kind`; all validation (`projectUrl`, `requirePlatformInfo`) and
  `rawParams.updateInfo` reading still happen in `#init()`, so timing is
  unchanged. Done as a standalone refactor step (its own commit, not mixed with
  tests); existing differ tests stay green. The harness then constructs
  `new BpmnDiffer(rawParams, fakeClient)`.
- **Diagram content** reuses existing `test/fixtures/` pairs (`base.bpmn` +
  variants, `base.dmn` + variants).

## Layer 3 — full e2e with the extension

- **Persistent context** with `--load-extension=<repo root>` (the repo root is
  the unpacked extension; the manifest is at the root).
- **`context.route('https://gitlab.example.com/**', 'https://gitlab.com/**')`**
  fulfills from fixtures: MR page HTML, `/api/v4/...` JSON, `/-/raw/...` XML,
  search (`/api/v4/.../search`, `/-/search`), `/changes`.
- `page.goto(<fixture MR URL>)` → the URL matches the manifest `matches`, so the
  content script injects normally → assert the button (presence, container,
  accent class, geometry).
- Click → a new tab (`context.waitForEvent('page')`) → assert the differ
  end-to-end. The real `GitLabPlatformClient` runs here; its fetches are
  intercepted too.
- **Risk to validate first:** MV3 + extension loading under headless Chromium.
  Modern headless supports extensions, but this is the first thing to confirm in
  the Layer-3 implementation; fall back to headed if needed.

## Fixtures

- **Layer 2 needs no GitLab fixtures** — the fake serves everything from memory;
  diagrams come from `test/fixtures/`.
- **Layer 3, default — synthetic GitLab-shaped pages (no corporate access).**
  Button injection keys off only a handful of container selectors
  (`GitLabDomScraper`, `GitLabUIRepoProvider`: `[data-path]`, `.is-active`,
  `<diff-file>`, the ref selector, `.merge-request-sticky-header-wrapper`, …),
  and the existing provider unit tests already build GitLab DOM by hand with
  small helpers (`docs/testing.md`: "we build right in the test … keep fixture
  files only for complex third-party DOM"). So Layer 3 starts with synthetic,
  hand/agent-authored page fixtures plus canned API/raw/search responses. This
  path is fully offline, fully automatable, and needs no human involvement.
- **Layer 3, optional higher fidelity — captured real pages.** If a regression
  ever depends on real GitLab markup, capture a scenario from the real
  `gitlab.example.com`. What this needs:
  - API / raw / search / `changes` JSON can be captured **automatically by an
    agent** if `glab`/a PAT is configured locally (plain GitLab REST calls — no
    manual clicking).
  - The rendered page HTML needs the human's session: a **one-time interactive
    login** in a Playwright-driven browser, after which `storageState` is saved
    and recaptures run unattended until the session expires.
  - Sanitization (strip auth/PII before committing corporate HTML): agent does a
    first scrub, the human reviews the diff.
  - Output committed under `test/e2e/fixtures/<scenario>/` (`page.html`,
    `api/*.json`, `raw/*.bpmn`, `search/*.json`, `changes.json`) via a capture
    mode (`test:e2e:capture`).
- Either way, once committed a fixture is an offline, deterministic golden
  anchor: "given this GitLab markup, the plugin behaves like this." A GitLab
  redesign means deliberately recapturing it.

## File layout, scripts, config

```
test/e2e/
  harness/    differ-harness.html
  support/    fake-platform-client.js, playwright fixtures, dom/style helpers
  fixtures/   <scenario>/page.html, api/, raw/, search/, changes.json
  *.spec.js   (Layer 2 and Layer 3 tests)
playwright.config.js
```

`test/e2e/` is a separate, non-mirrored subtree (like `test/structure/` and
`test/support/`).

- **devDependency:** `@playwright/test` (+ browsers).
- **Scripts:** `npm test` stays unit-only (fast loop). New scripts: `test:e2e`
  (all), `test:e2e:differ` (Layer 2), `test:e2e:full` (Layer 3), `test:e2e:ui`
  / `--headed` (debugging by eye), `test:e2e:capture` (record fixtures).
- **Playwright config:** `trace: 'retain-on-failure'`,
  `screenshot: 'only-on-failure'`, HTML reporter; artifacts in `test-results/`
  (git-ignored).
- **Before push:** `npm test` is mandatory as today; `npm run test:e2e` runs on
  demand / before merging (not on every commit, to keep the fast loop fast).
  When CI appears, e2e moves there.

## AI-friendliness (in practice)

On failure, a human *or* an agent gets the same artifacts (no LLM in the run):

- assertion text with numbers ("expected `button.x (320) > native.x (480)` →
  false"; "expected class `bpmn-surf-btn-accent` → missing");
- Playwright `trace.zip` (per-step DOM snapshot + network + console) and a
  screenshot;
- captured plugin `console.*` output (`page.on('console')` → attached as an
  artifact) — the differ logs verbosely;
- the test name = the feature/bug id;
- plus a helper that, on failure, dumps the relevant DOM subtree + computed
  styles compactly, so an agent need not open the trace to get structured
  signal.

`npm run test:e2e` → a deterministic offline run → output lists failed tests,
assertion text, and artifact paths. The human reads exactly what the agent does.

## Geometry vs "looks broken"

Geometric assertions via `getBoundingClientRect` / `boundingBox()` cover most
"moved off / didn't appear / wrapped to two rows" cases deterministically and
readably (non-zero size and within viewport → "appeared"; `x` ordering →
"placed to the right of"; equal `top` across toolbar groups → "single row";
panel width within the clamp; highlighted element's computed fill equals the
diff-type color; the search-current element inside the visible canvas). The
residual "subtly wrong but structurally correct" is caught by eye on the
screenshot artifact — diagnosis, not a gate.

## Phasing

- **Phase 1 (foundation + proof):** step 1 — the behavior-preserving refactor
  making `platformClient` a required constructor parameter and moving the factory
  to the bootstrap, in both differs (its own commit, existing tests green). Then
  Playwright + config → the differ harness → `FakePlatformClient` → 4–5 Layer-2
  tests on the highest-value features (diff highlight, switch branch, changes
  table + row click, conditions in the panel, search). Proves the harness and the
  artifact loop.
- **Phase 2:** expand Layer-2 coverage across the differ checklist (zoom/fit,
  hide properties, dive-in overlays, empty/absent states, view-only copy
  invariants).
- **Phase 3:** Layer-3 e2e — synthetic GitLab-shaped page fixtures (no corporate
  access), test button injection/placement/accent, click → differ smoke.
  Captured real-page fixtures are a later optional add-on (see Fixtures).

Each phase is its own MR, green before push. Start with Phase 1.

## Open risks

- MV3 extension under headless Chromium (Layer 3) — validate early; headed
  fallback exists.
- GitLab markup drift freezes with fixtures — accepted; recapture on redesign.
- `@playwright/test` adds a second test runner to the repo — accepted for the
  trace/artifact value.
