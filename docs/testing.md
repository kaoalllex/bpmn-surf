# Testing

## Every test must be observed failing

A test never observed failing is an assumption, not a guard. Before a regression test is done: **delete the fix, watch the test fail, restore the fix.** Cheap here — `npm test` is ~5 s, a single e2e spec ~2 s (`npx playwright test <spec>`).

Three shapes have actually produced tests that could not fail in this repo (audited in [REFAC-0014]) — the name and the comment were accurate, the assertion was not, which is why they read as coverage and survived review:

- **An absence assertion placed before the step that would produce the thing.** "A freshly opened editor shows no edit markers" asserted `toHaveCount(0)` at boot, where no recompute had run and no marker could exist whatever the baseline was. A guard for "X does not appear" has to run *after* the action that would make X appear — and the same spec should assert, on the way, that X *does* appear in the positive case.
- **Playwright counts a missing element as hidden.** `expect(locator).toBeHidden()` and `toHaveCount(0)` both hold when the selector matches nothing, so a renamed third-party class (`.djs-palette`, `.djs-context-pad`, any `bio-properties-panel-*`) silently turns the guard into a no-op. Assert `toHaveCount(1)` first, or deny a string the same test has just seen present.
- **A defensive branch exercised with a truthy stand-in for absence.** `new Map()` / `[]` / `{}` / `''` / `0` do not reach a `|| new Map()` or `|| []` fallback — the empty value is truthy. Pass the actual `null`/`undefined` the guard is written for.

A cheap sweep for the third shape: grep `src/` for `|| []`, `?? []`, `|| new Map()`, `if (!x) return`, remove one guard at a time and run `npm test`. Every guard that survives is either untested or protected only by a stand-in.

## Unit tests

There are unit tests for the isolated differ-page classes. Run: **`npm test`** (~5 sec, run after any changes in covered files and mandatorily before every push — see docs/git-workflow.md). The runner is the built-in `node:test`; the only dev dependency is `jsdom` (DOM/DOMParser for Node) — it does **not** get into the extension, `manifest.json` is not affected.

There is no separate report file: `node:test` prints failed checks (assertion diff + stack) right into the run output. Do not rerun the tests just to "look at the error" — the details are already in the output of the previous run, read them from there. A rerun is justified only after changes in the code/tests.

Layout (`test/`):
- The test layout **mirrors `src/`**: the test for `src/<path>/<name>.js` lives in `test/<path>/<name>.test.js` (e.g. `src/differ/bpmn/bpmn-xml-comparator.js` → `test/differ/bpmn/bpmn-xml-comparator.test.js`). One code file ↔ one (or several) test file along the same path — where to look for / where to put a test is derived from the source path without guessing. Shared infrastructure (`support/`, `fixtures/`) and structural tests (`structure/`) — at the root of `test/`, not mirrored. The runner finds tests at any nesting via the glob `test/**/*.test.js`.
- Wiring up the harness — via the canonical form `require('#scope')` (a subpath import from `package.json#imports`, resolved to `test/support/scope.js`), rather than a relative path: the import is the same at any depth of the tree. Fixtures are read by the `fixture(name)` helper from `scope.js` — the path to them does not depend on the test's location.
- `test/support/scope.js` — a vm harness: it executes prod files in a single jsdom vm context in `loadScripts` order (simulating the shared global scope of the differ page), **without modifying prod code**. To test a new class: add its file to `SCOPE_FILES` and its name to `EXPORTED_NAMES`. Files with side effects on load (`bpmn-differ.js`, `dmn-differ.js` — auto-call of `main()`) must not be added to the harness.
- `test/fixtures/` — pairs of BPMN/DMN XML (golden tests of the comparators: `base.bpmn` + variants; `camunda-base.bpmn` — a base for pinpoint variants via string replace right in the test), `dmn-table.html` (markup of the dmn-js table for `DmnDiffPainter`) and `properties-panel.html` (markup of the bio-properties-panel for `PropertiesPanelHighlighter`). A new comparison case = a new variant fixture (or a replace variant from `camunda-base.bpmn`) + a short test.
- Objects from the vm context have prototypes of their own realm: before `assert.deepEqual` wrap arrays in `Array.from`, Maps in `mapToObject` from scope.js.
- In DOM tests, all elements that the code looks up via `doWithAttempts` must be present in the fixture in advance: if an element is missing, the code will go into retries with delays (~1.5 sec) — the test will become slow. Build the "element not found" scenarios so that it never reaches the DOM lookup.
- Debugging trick: `scope.js` can be `require`-d from a one-off node script outside the tests, to run a comparator on a real pair of schemas and look at the full diff result (this is how the expected behavior is verified before pinning it down in tests).
- The tests pin down the **current** behavior, including quirks. The expectations may be changed only together with a deliberate change in behavior.

### Structural tests (`test/structure/`)

A separate class of tests — not "the logic of class X", but **invariants of the project structure**, which are otherwise protected only by prose in `docs/` and by discipline. They do not use vm/jsdom; they read the project's real files via the helper `test/support/source-tree.js` (parsing `manifest.json`, `utils.js#loadScripts`, `scope.js#SCOPE_FILES`, walking `src/`). Composition:
- `registries.test.js` — synchronization of the four path registries: all references in `src/hosts/content-scripts.json`/`web_accessible_resources`/`loadScripts`/`SCOPE_FILES` exist on disk; the differ files match in composition and **relative order** in `loadScripts` and `web_accessible_resources`; every content-scope file is in `content-scripts.json`; and no registry lists the same path twice (a duplicate loads a file twice into one global scope, where the second `const`/`class` throws — and every other check here still passes). For the vendored `libs/`: every lib `loadScripts` loads is in `web_accessible_resources`, and every relative `url()`/`@import` in a vendored stylesheet resolves to a synced, web-accessible file — `sync-libs.js` copies only the files it lists, so a library update that starts referencing a new file (a font, an imported sheet) fails here instead of shipping a broken reference. Catches the desync that otherwise breaks silently at runtime (`chrome.runtime.getURL` → empty) while unit tests stay green.
- `message-id.test.js` — the postMessage id matching between scopes (`App.MESSAGES.BPMN_ID`/`DMN_ID` ↔ `BpmnDiffer.MSG_ID`/`DmnDiffer.MSG_ID`).
- `source-layout.test.js` — uniqueness of basename across all of `src/` (the mirror layout rests on this) and the rule "every `src/**/*.js` either has a mirror test, or is listed in `UNTESTED_BY_DESIGN` with a reason". The `UNTESTED_BY_DESIGN` list must **shrink**: after adding a test, remove the entry (otherwise the stale check will fail). A new src file forces a deliberate decision — write a test or record why not.

Covered: `ConditionFormatter`, `FileTypeDetector`, `DifferParams`, `BpmnXmlComparator` (including the mapping of diffs to properties-panel groups and the documented blind spots: arrow retarget, rebinding of incoming/outgoing, the `default` attribute), `PropertiesPanelHighlighter`, `DmnXmlComparator`, `DmnDiffPainter`, `GitLabRepoProvider.getSourceCommitId` (commits.json, then the page's `diff_head_sha`), `GitLabRepoProviderBase` (init + project id resolution with cache), `GitLabUrlParser`, `GitLabDomScraper`, `MergedMrCommitResolver` (resolution with collaborator injection — without `fetch`/`localStorage`), `SingleEntryCache`, `GitLabApiRepoProvider`, `GitLabUIRepoProvider` (per-file buttons on rapid and legacy markup — placement, idempotency, recycled blocks; the branch split button and its menu), the GitHub side (`GitHubUrlParser`; `GitHubDomScraper` over captured pages of both "Files changed" UIs in `test/fixtures/github/` — merge base from `oldCommitOid`, classic `sha1`, renames; `GitHubChangesPayload`; `GitHubRepoProvider` — the page first, a stale payload after a soft navigation re-fetched, no request; `GitHubApiRepoProvider` — waits for a rendered page; `GitHubUIRepoProvider` — file and blob buttons; `GitHubPlatformClient` — payload before the REST fallback, `prFileDiffUrl`), the host logic (`normalizeHostPattern`, `userOriginsFrom`, `needsGitlabComNotice`), `FallbackRepoProvider` (selection/delegation), `App` (the MR change-view flow over stub providers: refs resolved across a URL change are not used, a click on a view the URL has left is not opened, a failing click is logged), `PageReloader` (the attempt-counter contract — `location.reload` is a no-op in jsdom, the observable counter in `sessionStorage` is checked), the pure functions of `utils.js`, `ConsoleLog` (`test/core/console-log.test.js` — the ring, the two-tier tail, the cycle collapsing, and what it refuses to log), plus the structural invariants (see above). `test/e2e/differ-github-navigation.spec.js` is the Layer-2 guard that a non-GitLab dive-in miss never walks GitLab's repository tree; `test/e2e/differ-github-search.spec.js` runs the real GitHub client against localhost (a non-github.com host, like Enterprise): a web-search hit, a PR-file hit under a 429, and the fallback to the host's search page.

The GitLab DOM markup in the provider tests (`gitlab-repo-provider.test.js`, `gitlab-ui-repo-provider.test.js`) we build right in the test with small helpers — it is trivial and parameterizable; we keep fixture files only for complex third-party DOM (`dmn-table.html`, `properties-panel.html`).

## E2E tests (Layer 2 — differ component)

### The three layers

| Layer | Location | Covers | Environment |
|-------|----------|--------|-------------|
| 1. Unit | `test/**` (`node:test` + jsdom) | Pure logic: comparators, parsers, providers in isolation | Node, ~0.5 s |
| 2. Differ component | `test/e2e/` | Differ rendering: diff highlight + colours, switch branch, changes table, properties panel, zoom/pan/fit, search, dive-in overlays, empty/absent states, view-only invariants | Real Chromium, **fake platform client**, offline |
| 3. Full e2e (not built yet — [INFRA-0008]) | `test/e2e/` | Content-script side: file detection, button injection + placement + geometry, click → differ tab opens. Real `GitLabPlatformClient` | Real extension in Chromium + network interception from fixtures |

Targeted per-feature tests live mostly in Layer 2 (cheap); large cross-cutting flows belong in Layer 3 (few, slower). Standing decisions behind this split:

- **Layer 2 injects a fake platform client** as a *required* constructor parameter (the factory lives in the bootstrap, so the orchestrator never chooses the client — the REFAC-0004 DI seam). Because the fake supplies no GitLab fields or URLs, any leak of provider specifics into the differ core breaks the Layer-2 tests — they actively guard the "universal differ" property.
- **Visual checks are a deterministic gate** — DOM, computed styles and geometry. Screenshots, traces and console output are failure *artifacts*, not assertions: no pixel snapshots, no AI vision in the gate.
- **No backend.** Layer 2 is fully offline (canned arrays, `data:` URLs); Layer 3 will use Playwright route interception against local fixtures. No Docker GitLab, no public sandbox.

A separate suite drives the **real** differ in a real Chromium via `@playwright/test` (a dev-only test runner, not a build step). Run: **`npm run test:e2e`** (`:e2e:ui` / `:e2e:headed` variants for debugging). It is **not** part of `npm test` — the unit suite stays unit-only and fast.

- Layout (`test/e2e/`): `*.spec.js` files (the `node:test` glob `test/**/*.test.js` ignores them — never name an e2e file `*.test.js`); `support/` — the static server (`static-server.js`, serves the repo over http so the differ scripts load with correct MIME types) and `FakePlatformClient` (`fake-platform-client.js`, an in-memory `PlatformClient` — diagram XML via `data:` URLs, search/changes via canned arrays — so the differ runs fully offline, no network interception; refs listed in `httpRefs` are served from `/fake-raw/<ref>` instead, so a spec can drop or delay them with `page.route`, as `differ-load-failure.spec.js` does); `harness/differ-harness.html` — a blank page the test boots the differ into; `fixtures/` — **diagrammed** BPMN (with a `bpmndi:BPMNDiagram` DI section, which bpmn-js needs to render — the `test/fixtures/` comparator fixtures are semantic-only and render "no diagram to display").
- `support/boot-differ.js` — the shared boot helper every BPMN spec imports: `bootBpmnDiffer(page, {params, fixtures, realClient})` (`realClient` keeps the real platform client instead of the stub, so a spec can route its requests), `defaultBpmnParams(overrides)`, `BPMN_FIXTURES`, `wireDiagnostics(page)`. Keeps the boot sequence (and the `utils.js` double-load neutralization) in one place. It also exports `bootDmnDiffer(page, {params, fixtures})` / `defaultDmnParams(overrides)` / `DMN_FIXTURES` for the DMN boot test, and the `CALL_ACTIVITY_BPMN` fixture for the dive-in test.
- How a test boots: load `utils.js` once, then run the **production** `loadScripts` (neutralizing its `utils.js` re-include — a second load throws "`const fileCache` already declared"), then `new BpmnDiffer(params, new FakePlatformClient(fixtures)).show()`. The differ orchestrators take the client as a required constructor parameter (REFAC-0004 DI seam), so the test injects the fake directly.
- Config (`playwright.config.js`): `trace: retain-on-failure`, `screenshot: only-on-failure`, HTML report in `playwright-report/` — AI-friendly failure artifacts. Both `test-results/` and `playwright-report/` are gitignored. On failure, inspect the trace/screenshot and the `[pageerror]`/`[console.error]` lines the spec mirrors into the run log — **do not guess** the cause.

Scope so far (Phase 1 + 1b + 2 + 4a + 4b): the harness, a BPMN boot/render smoke test, and Layer-2 feature tests for diff highlight, switch branch, the changes table + row click, the sequenceFlow condition in the properties panel, Ctrl/Cmd+F search, zoom in/out/fit, hide/show properties, empty/absent states (the "absent in both versions" centered message; the absent-side canvas-clear without a cover), the view-only copy invariants (BUG-0014/0015, JS `beforeinput` vetoes), and the Call Activity dive-in overlay — plus a DMN boot/render smoke test. **Phase 4a ("DMN parity")** brings the DMN differ up to par: DMN diff highlight in all three directions (added rule row green, removed rule row red, changed cell blue, changed decision-name header blue — colours assertable because `DmnDiffPainter` sets them inline), DMN switch-branch (indicator flip + added row disappears), and the two DMN absent states (the absent-side blank cover with the italic-grey "file does not exist" label and disabled Download; the both-absent centered message). All BPMN specs boot via the shared `test/e2e/support/boot-differ.js` helper (DMN via its `bootDmnDiffer` sibling), reusing the `test/e2e/fixtures/` BPMN pair, the `test/fixtures/` DMN pair (`base.dmn`/`added-rule.dmn`, plus the existing `changed-header.dmn` golden reused read-only and a new `dmn-cell-changed.dmn` for the changed-cell case), and a `test/e2e/fixtures/call-activity.bpmn` fixture. The harness now also loads `src/differ/styles.css` (Phase 4a enabler), so CSS-dependent assertions are unlocked for later phases. **Phase 4b ("BPMN diff depth")** deepens the BPMN side beyond the shipped "added" case: the ☼ diff-highlight marker in the **removed** and **changed** directions (the marker class is the same for all directions; the *colour* — `modeling.setColor` writes it inline on the `.djs-visual` child — is asserted per direction since [REFAC-0015], as is the pulse→steady phase swap); the BUG-0010 subprocess case (`differ-highlight-subprocess.spec.js`: a changed leaf inside a collapsed subprocess nested in an expanded one keeps the CHANGE fill and is the only changes-table row, while both enclosing subprocesses get the CHANGE stroke and join the ☼ highlight; drill-down shows the leaf filled); the changes table's removed/changed rows (connections included) and the Changed/Added/Removed counters, the list and counters following the plane on screen, plus resetSelection on hide and the absent-side `clear()` (canvas emptied, table/counters blank, "file does not exist" label, Download/Highlight disabled); FEAT-0029 auto-expand on both axes (Axis A — a changed group like Condition; Axis B — a type-relevant group like ServiceTask→Implementation, asserted via the `open` class on `.bio-properties-panel-group-header`, located by header **text** since the live panel sets no `title` attribute); property-group highlight (changed "In mappings" header blue + its list items coloured blue/green by direction, inline `backgroundColor`); and the sequenceFlow condition's direction inversion (the differing line green on the MR side, red after Switch). Phase 4b also fixed **BUG-0025** (the ☼ button was wrongly enabled in branch-only mode — `#showXml` re-enabled it unconditionally; now gated on `isSourceVersionDefined()`), pinned by `differ-highlight-branch-only.spec.js`. New DI fixtures live in `test/e2e/fixtures/` (`changed-task-name.bpmn`, `subprocess-base.bpmn`, `subprocess-changed-child.bpmn`, `changed-flow-condition.bpmn`, `call-activity-in-base.bpmn`, `call-activity-in-changed.bpmn`). `differ-open-handshake.spec.js` covers the one flow every differ tab starts with and that nothing else touches — `openDiffer`'s params message, from **both** of its contexts: a real origin (the content script) and an `about:blank` differ page opening a nested or edit tab, where `location.origin` is `'null'`. The second case is not optional: the first version of this spec tested only the http harness page, and the `about:blank` caller broke in production while the whole suite stayed green. the feature specs boot the differ directly and the dive-in specs stub `openDiffer` out, so a break there would leave both suites green. **FEAT-0024** adds `differ-feedback.spec.js`: the 💬 button in both differs (prefilled URL with `window.open` stubbed, the branch-only shape, the uncaught-error badge and the deliberate non-trigger on `console.error`) plus the toolbar's right-edge order, which the properties toggle joined when it became an icon. **Not yet covered:** CSS-based view-only invariants (hidden context-pad, disabled toggles/selects — the stylesheet is loaded now but these are not yet asserted), search navigation/toolbar depth (Phase 4c), the dive-in click→navigate flow, the rest of the navigation surface (handler/correlation/back), and full Layer-3 e2e (loaded extension + synthetic platform pages, [INFRA-0008]).

## Mutation sweep (`scripts/mutation-sweep.js`)

Coverage says a line ran; a mutation sweep says a test would notice if it were wrong. The script plants one small artificial bug at a time (`===`↔`!==`, `&&`↔`||`, a negated `if`, a renamed string literal) in the target source files and runs the suite against each. **Killed** = some test went red; **survived** = everything stayed green, so the bug is invisible. Score = killed/total — 100% is not the target, since *equivalent* mutants change nothing observable and survive by definition. Every survivor needs a human verdict.

```
node scripts/mutation-sweep.js                    # the eight priority files (~277 mutants, ~1 h)
node scripts/mutation-sweep.js --list             # generate only, run nothing
node scripts/mutation-sweep.js --files src/a.js   # one file
node scripts/mutation-sweep.js --resume           # continue an interrupted run
```

It works in an `rsync`ed copy of the tree (never the repo — a crash would leave the sources mutated), on its own port, and appends one JSONL verdict per mutant so a run is resumable. Survivors: `grep '"survived"' mutation-sweep.jsonl`. The findings and their verdicts live in [REFAC-0015]; do not re-litigate the ones recorded there without new evidence.

## CI

`.github/workflows/test.yml` runs on every pull request into master and every push to master: `npm ci`, `npm test`, then `npm run test:e2e` (Layer 2 in Chromium). A newer push to the same ref cancels the superseded run. On failure the run uploads `playwright-report/` as the `playwright-report` artifact (kept 7 days). There are no retries: a flaky test fails the run and stays visible. The live harness never runs in CI (see below).

Run the same thing locally before pushing:

```
npx playwright install chromium   # first time only, and after a Playwright bump
npm test && npm run test:e2e
```

## Live harness (`test/e2e/live/`)

Scripts that drive the real extension in a real browser against the public test
sandbox — see `test/e2e/live/README.md`. Not tests: outside `npm test` and
`playwright test`, never in CI, since they talk to gitlab.com.

Use them for anything that depends on GitLab's own markup or on timing, which is
where the diff button keeps breaking (the button showing for the wrong file, or
blinking). `mr-button.mjs <iid>` checks that every diagram block carries exactly
one correct button and that none churn; `branch-button.mjs` covers the blob
view; `search-page.mjs` checks that GitLab still serves the fallback search URL
the navigation locators open. The scenarios and the procedure live in the
`live-check` project skill (`.claude/skills/live-check/SKILL.md`).
`capture-login.mjs` stores a GitLab session in `~/.config` when a case needs the
per-user "Show one file at a time" preference; without it everything runs
anonymously. `capture-login.mjs --github` stores a github.com session in the same
profile.

The tracked manifest declares no site, so the harness does not load the repository
itself: `support.mjs` stages a copy (`manifest.json`, `src`, `libs`, `icons`) in the
temp directory with `host_permissions` for gitlab.com and github.com, the way an
internal build bakes hosts in, and waits for the service worker to register the content
scripts. The staged manifest differs from the store one on purpose.

**GitHub sandbox.** `github.com/kaoalllex/bpmn-surf-test` (public) and
`github.com/kaoalllex/bpmn-surf-test-private` (private) are the mutable test material,
the counterpart of the GitLab sandbox; public pull requests of other projects serve as
real-world samples (large PRs, forks, GitHub's CSP). There are no GitHub-specific
scripts yet: the GitHub scenarios of the `live-check` skill are driven by hand (or an
ad-hoc Playwright script on `launchWithExtension()`), signed in and anonymous
(`BPMN_SURF_ANONYMOUS=1`), with the Network panel filtered to `api.github.com` — a
signed-in run must make no request there (the search, raw and `page_data` requests go to github.com itself).

`BPMN_SURF_PROJECT=<url>` points the scripts at another project, and
`BPMN_SURF_ANONYMOUS=1` runs them in a throwaway profile, signed out. The other
project in use is `gitlab.com/kao.alllex/bpmn-surf-demo`, a **frozen showcase**.
The store reviewer instructions, the README GIF and the screenshots depend on it,
so only read-only scripts and `record-demo.mjs` (which records that media) may
run there. Its rules are in [`test/e2e/live/README.md`](../test/e2e/live/README.md#the-demo-project).

`popup-screens.mjs` is the exception that needs no network: it renders every
popup screen with a stubbed `chrome.*` and reports height and overflow, then
re-renders the site warnings and prints `warning-visible=` for `#noSitesWarning`,
`#noSitesHomeWarning` and `#gitlabComNotice` in three states: no site granted
(both "no site" warnings, `popup-sites-none.png`), an update from 1.3.x that lost
gitlab.com (the notice, `popup-gitlab-notice.png`), and gitlab.com + github.com
granted (all hidden, both listed with `×`).

## Manual checking

There are no integration auto-tests. Checking is manual: load the unpacked extension via `chrome://extensions` (Developer mode → Load unpacked) and check it on a GitLab MR / file page. Before committing, mentally verify that the script order and behavior are not broken.

- ⚠️ **After every code change, reload the extension in `chrome://extensions/` (the reload icon on its card) before checking** — otherwise the loaded extension keeps the old code and you verify against stale code, drawing a false conclusion. Reloading also orphans content scripts in tabs opened earlier: a click there throws `Extension context invalidated` (handled gracefully — the user is asked to refresh the page), so reload the GitLab tab too after reloading the extension.
- Quick syntax check: `for f in *.js; do node --check "$f"; done`
- Before checking the buttons by hand, run the `live-check` skill's catalog: it answers the common questions without a single click
- After changes in the shared differ-page classes (`differ-params.js`, `diagram-versions.js`, `branch-indicator.js`, `diff-type.js`, `utils.js`) **be sure to check both the BPMN and the DMN diff**
- Differ-page checklist: diff highlighting, switch branch, highlight on/off, the change table + clicking a row, sequenceFlow conditions in the properties panel, zoom/pan/fit, hide properties, download, dive-in into a Call Activity, branch-only mode (without an MR), the 💬 feedback button (the prefilled issue opens, its body has no XML)
- View-only invariants (after any change that restricts interaction): editing stays disabled, **yet** mouse selection + Ctrl/Cmd+C copy still work on a canvas label and on a properties-panel field value (regression class BUG-0011 → BUG-0014 → BUG-0015)
