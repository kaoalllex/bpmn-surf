---
id: REFAC-0004
title: Code-hosting platform abstraction → GitHub support
priority: high
status: in-progress
---

## Statement

Make the plugin work not only on GitLab repositories but also on **GitHub** (github.com),
keeping the core fully provider-agnostic so a third provider (e.g. Bitbucket) can be added
later without touching the core. All GitLab specifics must live only inside the GitLab
provider/client implementations.

This is a **large, multi-session task**. It is split into three subtasks delivered
incrementally; each step keeps `npm test` green and **must not change GitLab behaviour**
until GitHub-specific code is reached.

## Context

Architecture analysis (2026-06-23 session, see Work log) found the plugin is **half-ready**:

- **Content scope** (the repo page → `App`) is **well isolated**. `App` (`app.js`) talks only
  to the neutral `RepoProvider` / `UIRepoProvider` interfaces; concrete providers are assembled
  in `repo-provider-factory.js` and chosen at runtime by `FallbackRepoProvider`. Adding GitHub
  here = two new implementations + one factory line. The core is untouched.
- **Differ scope** (the separate diff tab) is the **leak**. The differ receives a passive
  `platform = {kind, projectUrl, hostUrl, projectId}` descriptor (built by `diff-params-builder.js`)
  and then constructs GitLab URLs **inline**, in code, with **no client abstraction**:
  - `DifferParams.rawFileUrl()` / `blobFileUrl()` (`differ-params.js:67,74`) are hardcoded
    GitLab `/-/raw/` and `/-/blob/` formats. `DiagramVersions.#loadXml` (`diagram-versions.js:35`)
    loads **both diagram versions** through `rawFileUrl` — so even the basic diff is GitLab-shaped.
  - The 7 navigation locators in `src/differ/navigation/` build GitLab Advanced Search URLs
    (`/api/v4/projects/{id}/search?scope=blobs&ref=…`), `/-/raw/`, `/-/blob/`, `/-/search`,
    and `/-/merge_requests/{iid}/changes` directly: `call-activity-locator.js`,
    `decision-locator.js`, `caller-locator.js`, `decision-caller-locator.js`,
    `handler-locator.js`, `correlation-locator.js`, `process-file-index.js`.
  - `platform.kind` is declared as a discriminator but **read nowhere** — a dead forward-looking seam.

**Corner cases (confirmed real):**
1. **Auth model differs fundamentally.** `loadFileContent` (`utils.js:42`) is a bare `fetch(url)`
   on ambient browser-session cookies. GitLab (raw/blob/API on the same host under a cookie) works
   this way. GitHub does **not**: `api.github.com` / `raw.githubusercontent.com` are not authenticated
   by github.com session cookies; private repos need `Authorization: token <PAT>`. → private GitHub
   needs a token-management layer that does not exist today (deferred to subtask 3).
2. **Code Search semantics incompatible.** All advanced navigation stands on GitLab Advanced Search
   (`scope=blobs`, arbitrary `ref`). GitHub Code Search API searches the **default branch only**, no
   arbitrary `ref`, requires auth, ~10 req/min rate limit, different JSON shape and tokenization.
   → navigation on GitHub is degraded by design; deferred to subtask 3.

**Decisions for this task (2026-06-23):**
- GitHub target = **github.com only** (design keeps host configurable so GitHub Enterprise Server
  is a later, small addition).
- Subtask-2 MVP scope = **basic two-version diff + render only** (PR/file detection, load both
  versions, render highlighted diff, "open in GitHub" links). Advanced navigation deferred to subtask 3.
- File restructure by provider folders = **yes**, as an isolated step **1.2**.

Related: [REFAC-0001] (MR API params), [REFAC-0002] (decompose GitLab provider),
[REFAC-0007]/[REFAC-0008] ("doomed" DOM/ProcessFileIndex fallbacks — see note in subtask 3).

---

## Target architecture (the two seams)

Two distinct abstractions in the two script scopes, both keyed on the **same** `platform.kind`
discriminator. No change to the `platform` descriptor shape (`{kind, projectUrl, hostUrl, projectId}`)
is required — GitHub simply derives `api.github.com/repos/{owner}/{repo}` from `projectUrl` and may
ignore `projectId`.

```
CONTENT SCOPE (repo page)                 DIFFER SCOPE (diff tab)
─────────────────────────                 ───────────────────────
App ── RepoProvider      (exists)         BpmnDiffer/DmnDiffer + locators
    └─ UIRepoProvider    (exists)             └─ PlatformClient        (NEW seam)
   created by repo-provider-factory.js        created by platform-client-factory.js
   chosen by FallbackRepoProvider             chosen by platform.kind
        ├─ gitlab/  (exists)                       ├─ GitLabPlatformClient (NEW, wraps today's URLs)
        └─ github/  (NEW)                          └─ GitHubPlatformClient (NEW)
```

### New differ-scope interface: `PlatformClient`

Encapsulates **every** platform-specific data access the differ page performs. Derived from the
actual leaks above. Method list (normalized return shapes so GitHub's different JSON/URLs never
leak back into the locators):

| Method | Replaces today | Notes |
|--------|----------------|-------|
| `rawFileUrl(ref, filePath)` → string | `DifferParams.rawFileUrl`, locator `/-/raw/` | step 1.1: URL only (public GitHub uses `raw.githubusercontent.com`). Subtask 3 may promote to `loadFile()` for auth. |
| `blobFileUrl(ref, filePath, line?)` → string | `DifferParams.blobFileUrl`, locator `/-/blob/` | human "open in repo" URL (FEAT-0026 + handler/correlation navigators). |
| `searchCode(ref, term)` → `Promise<Array<{path, line, snippet}>>` | locator `/api/v4/.../search?scope=blobs` + GitLab JSON parsing | **normalized** hits. GitLab/GitHub parse their own response inside the client. The exact-term gate (BUG-0013) / classification stay in the locators (they work on `snippet`). |
| `searchPageUrl(term, ref)` → string | locator `blobSearchPageUrl` (`/-/search`) | human search page. GitHub: `https://github.com/search?q=…+repo:o/r&type=code`. |
| `prChangedFiles(changeId)` → `Promise<Array<{path, oldPath, status}>>` | `handler-locator` `/changes` API parsing | GitLab `/merge_requests/{iid}/changes` vs GitHub `/pulls/{n}/files` (`previous_filename`→`oldPath`). |
| `prDiffsUrl(changeId)` → string | `handler-locator` `/-/merge_requests/{iid}/diffs` | human PR/MR page. GitHub: `/pull/{n}/files`. |

`process-file-index.js` tree-walk (`/repository/tree`) is the **"doomed" fallback** of
`CallActivityLocator` ([REFAC-0007]). Do **not** port it to GitHub: `GitHubPlatformClient` may omit
tree support; `CallActivityLocator` already treats `ProcessFileIndex` as a best-effort fallback, so
it simply yields no result on GitHub. Document, don't replicate.

### New files

```
src/differ/platform/
  platform-client.js           # interface (throw-stub methods, like repo-provider.js)
  gitlab-platform-client.js    # wraps today's GitLab URL/search/changes logic
  github-platform-client.js    # NEW provider (filled across subtasks 2–3)
  platform-client-factory.js   # createPlatformClient(platform) → switch on platform.kind
src/content/providers/github/
  github-repo-provider.js
  github-ui-repo-provider.js
  github-url-parser.js         # pure URL/path parsing (mirror of gitlab-url-parser.js)
  github-dom-scraper.js        # DOM reads of the GitHub page (mirror of gitlab-dom-scraper.js)
```

---

## Subtask 1 — Architecture: introduce the abstractions (NO behaviour change)

Goal: after subtask 1, GitLab works **byte-for-byte** as before, GitHub does nothing yet, all tests
green. Three independent, separately-committable steps.

### Step 1.1 — Differ-scope `PlatformClient` abstraction (pure refactor) — ✅ DONE (2026-06-23, MR !135)

The heaviest step. Pure move of GitLab specifics behind the interface.

1. Create `src/differ/platform/platform-client.js` — the interface with the 6 methods above
   (each throws `'… must be implemented'`, mirroring `repo-provider.js`).
2. Create `src/differ/platform/gitlab-platform-client.js` — moves the GitLab URL/search/changes
   construction **verbatim** out of `DifferParams` and the locators:
   - `rawFileUrl`/`blobFileUrl`: copy from `differ-params.js:67,74`.
   - `searchCode(ref, term)`: move the `/api/v4/projects/{id}/search?scope=blobs&ref=…` fetch
     **and** the GitLab response parsing (`path`, `startline`→`line`, `data`→`snippet`) here. The
     locators (`call-activity`, `decision`, `caller`, `decision-caller`, `handler`, `correlation`)
     call `searchCode` and keep their own gating/classification on the normalized hits.
   - `searchPageUrl`: move `blobSearchPageUrl`'s `/-/search?search=…&scope=blobs&ref=…`.
   - `prChangedFiles`/`prDiffsUrl`: move `handler-locator`'s `/changes` fetch+parse and the
     `/-/merge_requests/{iid}/diffs` URL.
   - Constructor takes `{projectUrl, hostUrl, projectId}` (today's locator constructor args).
3. Create `src/differ/platform/platform-client-factory.js` —
   `function createPlatformClient(platform)` → `switch (platform.kind)` → `'gitlab'` returns a
   `GitLabPlatformClient`; default `throw`. (GitHub case added in subtask 2.)
4. Wire it in the orchestrators (`bpmn-differ.js`, `dmn-differ.js`): build one
   `this.#platformClient = createPlatformClient(this.#params.platform)` and pass it into every
   locator constructor **instead of** `(projectUrl, hostUrl, projectId)`. Pass it to
   `DiagramVersions` too (for `rawFileUrl`).
5. Refactor the locators (`src/differ/navigation/*`) to depend on `PlatformClient`:
   replace the private `#projectUrl/#projectHostUrl/#projectId` fields + inline URL builders with
   calls to the injected client. Keep all higher-level logic (caches, exact-term gate, classification,
   `selectCallers` purity) unchanged — those stay unit-tested as-is.
6. `DifferParams`: remove `rawFileUrl`/`blobFileUrl` (now on the client). Update the two debug-log
   call sites in `bpmn-differ.js:341` and `dmn-differ.js:128` and the `blobFileUrl` call sites
   (`bpmn-differ.js:576`, `dmn-differ.js:240`) to use the client. Keep `identityKey`, refs, etc.
7. **Registries** (differ scope): add the 3 new files to
   `manifest.json#web_accessible_resources`, `utils.js#loadScripts` (order: after `utils.js`,
   **before** the navigation locators and before `bpmn-differ.js`/`dmn-differ.js` —
   `platform-client.js` → `gitlab-platform-client.js` → `platform-client-factory.js`), and
   `test/support/scope.js#SCOPE_FILES`. `test/structure/registries.test.js` enforces sync.
8. **Tests:** add `test/differ/platform/gitlab-platform-client.test.js` (pure URL builders +
   `searchCode` parsing against a fixture GitLab search JSON, fetch injected/faked). Update locator
   tests to inject a fake `PlatformClient` instead of faking `loadFileContent`/URLs.

**Acceptance 1.1:** `npm test` green; manual GitLab smoke unchanged — open an MR diff (BPMN + DMN),
verify render, dive-in to a Call Activity, handler badge navigation, correlation lookup, "open in
GitLab" header link, single-commit diff labels.

### Step 1.2 — File restructure by provider (mechanical, isolated commit) — ✅ DONE (2026-06-23)

Content-scope GitLab files are already grouped under `src/content/providers/gitlab/`. This step:

1. Create `src/content/providers/github/` (empty until 1.3) and `src/differ/platform/` (from 1.1).
2. Confirm the neutral content files stay at `src/content/providers/`
   (`repo-provider.js`, `ui-repo-provider.js`, `repo-provider-factory.js`, `fallback-repo-provider.js`).
3. If any provider-specific file is still mislocated, `git mv` it into its provider folder and
   update **all four registries** in the same commit:
   `manifest.json#content_scripts` (order critical) + `#web_accessible_resources`,
   `utils.js#loadScripts`, `test/support/scope.js#SCOPE_FILES`.
4. Update `docs/architecture.md` directory tree + key-files table.

**Acceptance 1.2:** `npm test` green (esp. `registries.test.js`); no behaviour change. (If the
analysis shows nothing actually needs moving, this step is just creating the two new folders +
the doc note — keep it tiny.)

### Step 1.3 — Inert GitHub stubs (no behaviour change) — ✅ DONE (2026-06-23)

1. `src/content/providers/github/github-repo-provider.js` extends `RepoProvider`:
   `isAvailable()` returns `false` for now (or `host === 'github.com'` but `init()` returns `false`)
   — must be a **guaranteed no-op** on every current page. Other methods throw "not implemented yet".
2. `github-ui-repo-provider.js` extends `UIRepoProvider`: methods are safe no-ops.
3. `github-platform-client.js` extends `PlatformClient`: methods throw "GitHub not supported yet".
4. Register in `repo-provider-factory.js`:
   `createRepoProvider()` → `new FallbackRepoProvider([new GitLabApiRepoProvider(), new GitLabRepoProvider(), new GitHubRepoProvider()])`.
   `createUIRepoProvider()` must pick GitLab vs GitHub by host — introduce host-based selection here
   (e.g. a small `createUIRepoProvider()` that returns the GitHub UI provider on github.com, GitLab
   otherwise). Keep GitLab the default so nothing changes off github.com.
5. `platform-client-factory.js`: add `case 'github'` → `GitHubPlatformClient`.
6. Add the github stub files to content/differ registries (manifest content_scripts +
   web_accessible_resources, loadScripts, scope.js).
7. **Do NOT** add `https://github.com/*` to `manifest.json#content_scripts.matches` yet — keep the
   stubs unreachable on real pages until subtask 2. (Or add it but guarantee `isAvailable()`/`init()`
   short-circuit — prefer not adding the match to avoid any injection on github.com prematurely.)

**Acceptance 1.3:** `npm test` green; loading the extension and browsing GitLab is unchanged;
browsing github.com does nothing (no buttons, no errors).

### Step 1.4 — Centralize platform detection (`detectPlatformKind`) — pure refactor (NO behaviour change) — ✅ DONE (2026-06-23, MR !137)

Follow-up that generalizes the host selection introduced in 1.3. Today "which platform is this
page?" is answered in **four** inconsistent places in the content scope — an exact host match, a
URL substring, a stub `false`, and a literal — which makes enabling GitHub (subtask 2) a four-site
change instead of the one-line change the factory header promises (*"Adding a new platform … is a
change here only"*). This step collapses them to one source of truth, keyed on the **same**
`platform.kind` vocabulary the differ scope already uses.

Scattered today:
- `repo-provider-factory.js` `createUIRepoProvider` — `window.location.hostname === 'github.com'`.
- `gitlab-repo-provider-base.js:32` `isAvailable()` — `window.location.href.includes('gitlab')`
  (loose substring on purpose, for self-hosted `gitlab.example.com`).
- `github-repo-provider.js` / `github-ui-repo-provider.js` — stub `return false` (subtask-2 territory).
- `diff-params-builder.js:51` `#platform()` — literal `kind: 'gitlab'`.

Steps:

1. Create **`src/content/providers/platform-detection.js`** — a pure, dependency-free module:
   ```js
   // Ordered most-specific first: github.com wins before the loose gitlab substring.
   const PLATFORM_MATCHERS = [
       { kind: 'github', matches: (loc) => loc.hostname === 'github.com' },
       { kind: 'gitlab', matches: (loc) => loc.href.includes('gitlab') }
   ];
   function detectPlatformKind(location = window.location) {
       const matcher = PLATFORM_MATCHERS.find((m) => m.matches(location));
       return matcher ? matcher.kind : null;
   }
   ```
   The `location` param (defaulting to `window.location`) keeps it unit-testable without globals.
2. `repo-provider-factory.js` — `createUIRepoProvider()` becomes
   `return detectPlatformKind() === 'github' ? new GitHubUIRepoProvider() : new GitLabUIRepoProvider();`
   (GitLab stays the explicit default, so behaviour off github.com is byte-for-byte identical).
3. `gitlab-repo-provider-base.js` — `isAvailable()` becomes `return detectPlatformKind() === 'gitlab';`.
   On every gitlab URL the matcher returns `'gitlab'` (github test fails, gitlab substring matches),
   so this is identical to today's `includes('gitlab')`.
4. `diff-params-builder.js` — `#platform()` sets `kind: detectPlatformKind()` instead of the literal.
   This is the **single source of truth** for `kind`: it supersedes the subtask-2 idea of a
   `ProjectInfo.platformKind` field (removed from subtask 2 below). Detection-by-URL and the active
   provider's identity always agree (a provider is available only on its own host), so re-detecting
   here is safe and avoids threading the kind through `ProjectInfo`. On every gitlab page this still
   yields `'gitlab'` → the descriptor is unchanged.
5. **GitHub providers stay inert** — `github-repo-provider.js` / `github-ui-repo-provider.js` keep
   `return false`; they are **not** wired to `detectPlatformKind` yet. The `'github'` matcher entry
   is dormant until subtask 2 flips the providers on (then it activates with no further factory
   edits). This preserves 1.3's guarantee: github.com does nothing.
6. **Registries** (content scope only — the differ gets `kind` from the descriptor, it does not detect
   from a URL): add `platform-detection.js` to `manifest.json#content_scripts` (order: **before**
   `gitlab-repo-provider-base.js`, `repo-provider-factory.js`, and `diff-params-builder.js` — it has
   no dependencies, so it loads early) and `test/support/scope.js#SCOPE_FILES`.
   `registries.test.js` enforces sync. **Not** in `web_accessible_resources` / `utils.js#loadScripts`
   (those are differ scope).
7. **Tests:** add `test/content/providers/platform-detection.test.js` (pure, thorough): `github.com`
   → `'github'`; `gitlab.example.com`, `gitlab.com`, any URL containing `gitlab` → `'gitlab'`;
   ordering (a `github.com` URL with `gitlab` in the path → `'github'`, not `'gitlab'`); unknown host
   → `null`. Existing `gitlab-repo-provider-base` / `diff-params-builder` tests stay green unchanged
   (behaviour identical). `platform-detection.js` has logic, so it is **not** added to
   `source-layout.test.js#UNTESTED_BY_DESIGN`.

**Acceptance 1.4:** `npm test` green; GitLab behaviour byte-for-byte unchanged (same `isAvailable`,
same `platform.kind`, same UI provider on every gitlab page); github.com still does nothing. Enabling
GitHub in subtask 2 is now a one-line matcher entry already in place + flipping the providers.

---

## Decisions pending before Subtask 2 (owner: human)

The rewritten Subtask 2 below assumes the recommended option of each. Change it here before the
work starts if you disagree.

| # | Decision | Recommended |
|---|----------|-------------|
| D1 | How GitHub is turned on | A one-click **"Enable on github.com"** button on the popup's Sites screen (hidden once granted; then github.com is listed with its × like any host). Typing `github.com` into the Add form works too. Alternative: the form only, plus a hint line. |
| D2 | Where PR refs come from | Unauthenticated REST API, 2 calls per PR (`pulls/{n}` + `compare/{base.sha}...{head.sha}`), cached per PR for the page lifetime, failures included. Alternative: scrape SHAs from two different GitHub DOMs. |
| D3 | What the user sees when GitHub data is unavailable (private → 404, rate limit → 403/429) | No buttons + one `console.info` with the reason per PR per page load; docs and listing say "public repositories". A visible notice comes with subtask 3's token. Alternative: alert on first click (needs App-flow changes). |
| D4 | Which PR views get buttons | Whole-PR views only (`/pull/{n}/files`, `/pull/{n}/changes`); commit and range views get none (they would be diffed and labelled as the whole PR). |
| D5 | Navigation on GitHub (dive-in, callers, handler, correlation) | Degrade, don't gate: `searchCode`/`prChangedFiles` reject, the navigators' existing fallbacks open github.com code search; no changed-handler badges. Alternative: hide badges via a capability flag on `PlatformClient`. |
| D6 | "Search in GitLab" link text (correlation menu, dive-out menu) | Neutral "Search in repository" everywhere (also changes the GitLab UI text). Alternative: a `displayName` on `PlatformClient` plumbed through two locators. |
| D7 | Live fixture repo | Create public `kaoalllex/bpmn-surf-github-test` mirroring the GitLab sandbox scenarios. Until then use the third-party PRs listed below. |
| D8 | Store-facing text | Ship with the next release: `manifest.json#description` → "Review BPMN & DMN changes in GitLab merge requests and GitHub pull requests as diagrams, not XML, with every change highlighted." (128/132 chars), README, listing via [INFRA-0012]. No permission change → no store warning. |
| D9 | "Diff with local file…" menu on the GitHub blob button | Not in this subtask (plain button); porting needs a shared-UI refactor. |
| D10 | Signed-in "Files changed" DOM | The human provides one DevTools capture of `/pull/{n}/changes` while signed in (the only open question code and docs could not close — see below). |

## Open questions — resolved 2026-10-08

- **Permissions for store users → no manifest change at all.** The manifest has no
  `host_permissions`, `content_scripts[0].matches` stays `["https://gitlab.com/*"]`, and
  `optional_host_permissions: ["https://*/*"]` already covers github.com. Granting
  `https://github.com/*` from the popup makes the service worker register the content scripts
  there (FEAT-0033's `reconcileHostRegistrations`), exactly as for a self-managed GitLab — so an
  update ships with no re-confirmation. `api.github.com` and `raw.githubusercontent.com` need no
  permission: both answer `Access-Control-Allow-Origin: *`, and github.com's CSP `connect-src`
  lists both (the differ's `about:blank` tab inherits that CSP). What the CSP does block in the
  differ is page-world `eval`/`new Function` (no `'unsafe-eval'`); extension-scheme scripts and
  fonts are exempt (they already load under gitlab.com's equally strict `font-src 'self'`). The
  dmn-js bundle has one `new Function` in a DOM-walker selector compiler — covered by the live
  DMN check, not expected on the render path.
- **Public fixtures** (merged PRs, immutable; verified 2026-10-08):
  `camunda/camunda-bpm-examples#149` (2 modified BPMN, substantive), `#104` (modified DMN),
  `camunda/camunda-modeler#6197` (renamed BPMN + DMN), `camunda/camunda-bpm-examples#260` (fork PR,
  fork deleted — its head SHA still loads from the base repo's raw URL); blob views
  `camunda/camunda-bpm-examples/blob/master/clients/java/order-handling/order-handling.bpmn` and
  `…/dmn-engine/dmn-engine-drg/src/main/resources/org/camunda/bpm/example/drg/dinnerDecisions.dmn`.
  An own repo is D7. Record the final set in `docs/testing.md` with subtask 2.
- **DOM selectors.** Two "Files changed" UIs are live: **classic** at `/pull/{n}/files`
  (signed-out and opted-out users) and the **new React UI** at `/pull/{n}/changes` (signed-in
  default since GitHub's 2026-01-22 changelog "Improved pull request Files changed page on by
  default"; anonymous `/changes` redirects to `/files`). Classic, verified: per file
  `<copilot-diff-entry data-file-path>` → `div.file.js-file` → `div.file-header[data-path]
  [data-file-type][data-file-deleted]` → actions container `.file-actions > .d-flex`; the path is
  also on `[data-tagsearch-path]` and `clipboard-copy[value]`. Blob page (React, both states),
  verified: the ref is the tail of `a[data-testid="breadcrumbs-repo-link"]`'s
  `href="/{o}/{r}/tree/{ref}"` (unambiguous even for slashed branch names — the URL alone is
  not); file name in `[data-testid="breadcrumbs-filename"] h1`; button anchor = the
  `div[data-component="ButtonGroup"]` holding `a[data-testid="raw-button"]`. The page's embedded
  `refInfo` JSON is **not** usable: it is not refreshed on soft navigation. **Still open: the new
  UI's per-file selectors** — they cannot be fetched anonymously (D10).
- **Rate limit — facts.** Unauthenticated REST = 60 requests/hour **per IP** (a shared office
  NAT shares it); exceeded → 403 or 429 with `x-ratelimit-remaining: 0`, retry after
  `x-ratelimit-reset` (docs.github.com, "Rate limits for the REST API"). raw.githubusercontent.com
  is not REST and is not counted; it caches `max-age=300`, so a branch ref (blob view) may serve
  content up to 5 minutes old; SHAs are immutable. Handling = D2/D3.
- **Error UX** → D3.
- **DMN specifics — closed.** Labels already exist in `GitLabUIRepoProvider#getButtonText`
  ("Schema diff"/"Decision diff", "View schema"/"View decision"); subtask 2 lifts them to
  `UIRepoProvider` and reuses them. Detection is the shared `FileTypeDetector` (by extension) — no
  GitHub-specific code.
- **MVP method coverage — closed.** Called eagerly when a differ opens: `rawFileUrl` (both
  versions + a debug log line), `blobFileUrl` (header path link), `prChangedFiles` (PR mode only,
  in `BpmnDiffer#loadChangedHandlers`'s try/catch — a rejection just means no badges). On click
  only: `searchCode` + `searchPageUrl` (dive-in, decision, callers picker, handler, correlation);
  `prDiffsUrl` only for a changed handler, unreachable without `prChangedFiles`. Found on the
  way: **`ProcessFileIndex`** (the GitLab `/api/v4/…/repository/tree` walk) is built
  unconditionally in `bpmn-differ.js#init` and fires on any dive-in miss — it must become
  GitLab-only.
- **Correctness traps found while closing these** (each gets a test in subtask 2):
  `pulls/{n}.base.sha` is not the merge base once the base branch moves, while GitHub's
  "Files changed" diffs against the merge base → take `merge_base_commit.sha` from
  `compare/{base.sha}...{head.sha}` (the same response carries `previous_filename` for renames,
  ≤300 files). `App` re-runs `init()` on every mouseup → cache the PR lookup, failures included,
  or every click burns quota. `App#resolveChangeView` reloads the page when
  `getSourceCommitId()` is null → an API failure must fail `init()` instead.

---

## Subtask 2 — GitHub for PUBLIC repos, enabled from the popup (basic diff + render)

Rewritten 2026-10-08 for store users (the original predated the store listing and added required
hosts). Scope: on github.com, after the user enables it in the popup, detect PR "Files changed"
(both UIs) and blob pages, load both versions of a `.bpmn`/`.dmn`, render the diff, link back to
GitHub. Public repositories only, no auth; navigation degrades (D5). Assumes the recommended
options of D1–D10.

1. **No manifest permission change.** `host_permissions` stays absent, `content_scripts.matches`
   stays gitlab.com only. The only manifest edits: the two new content files in
   `content_scripts[0].js`, and `description` (D8).
2. **Popup / hosts:** delete `UNSUPPORTED_HOSTNAMES` + `isUnsupportedHost`
   (`src/hosts/host-patterns.js`) and their uses in `popup.js` and `settings.js#parseSettingsExport`,
   their tests and the `scope.js` export (closes the [BUG-0043] guard). Add the D1 button (same
   `chrome.permissions.request({origins: ['https://github.com/*']})` path as the Add form). Update
   `test/e2e/live/popup-screens.mjs` (it currently asserts the refusal).
3. **`github-url-parser.js`** (new, pure): `parsePullFiles(href)` (exact `/pull/{n}/files|changes`,
   D4), `parseBlob(href)` (decoded ref-and-path remainder), `getBranchFileType(href)`,
   `splitRefAndPath(refAndPath, ref)`, `pullApiUrl`, `compareApiUrl`.
4. **`github-dom-scraper.js`** (new): `fileBlocks(doc) → [{path, actions}]` for both PR UIs,
   `findBlobRef(doc, owner, repo)` (breadcrumbs repo link), `blobActionsAnchor(doc)` (the Raw
   button group). Selectors prefer `data-*`; the React UI's classes are hashed per build.
5. **`github-repo-provider.js`** (replace stub): `isAvailable(kind) → kind === GITHUB`; `init()` →
   false off PR/blob pages with **no network**; on a PR page loads `pulls/{n}` +
   `compare/{base.sha}...{head.sha}` once per PR (cached as a promise, failures too), returns
   false on failure (D3 `console.info` with the reason). Source = `head.sha`, target =
   `merge_base_commit.sha`, labels/branch names = `head.ref`/`base.ref`, `getTargetFilePath` from
   the compare `files[]` renames; project info `{url: https://github.com/{o}/{r}, hostUrl:
   https://github.com, groupName: o, name: r, id: "o/r"}`. Blob view: ref from the scraper, path =
   remainder after `{ref}/`. Fork PRs need nothing special (head SHA loads from the base repo).
6. **`github-ui-repo-provider.js`** (replace stub): per-file "Schema diff"/"Decision diff" buttons
   prepended to each block's actions (idempotent `syncFileButtons`, click does not toggle the
   file), "View schema"/"View decision" before the Raw group on a blob. Lift the icon SVG and
   `getButtonText` from `GitLabUIRepoProvider` into `UIRepoProvider` (pure move, own commit).
   Style via `content-styles.css` without touching GitLab-visible rules; add GitHub dark-mode
   overrides (`html[data-color-mode="dark"]`, and `auto` + `prefers-color-scheme`).
7. **`github-platform-client.js`** (replace stub): `rawFileUrl` →
   `https://raw.githubusercontent.com/{o}/{r}/{ref}/{path}`, `blobFileUrl` →
   `https://github.com/{o}/{r}/blob/{ref}/{path}#L{line}` (both encode each path segment — spaces,
   `#`, `?`), `searchPageUrl` → `https://github.com/search?q=repo:{o}/{r} {term}&type=code` (ref
   ignored: GitHub indexes the default branch); `searchCode`/`prChangedFiles` reject,
   `prDiffsUrl` throws, "not supported on GitHub yet" (D5).
8. **Differ:** build `ProcessFileIndex` only for `platform.kind === 'gitlab'` (`CallActivityLocator`
   already skips a null fallback); D6 label in `back-navigator.js` and `correlation-navigator.js`.
   `diff-params-builder.js` needs nothing — `detectPlatformKind()` already yields `'github'`.
9. **Tests:** mirror unit tests for the parser, scraper (classic markup inline; new UI from a
   trimmed capture in `test/fixtures/github/`), repo provider (fake loader: merge base, renames,
   one fetch per PR, failure → `init()` false and no refetch, no request off PR/blob pages,
   slashed blob ref), UI provider, platform client (encoding, search URL, rejections); a Layer-2
   spec that a non-GitLab dive-in miss makes no `/api/v4/` request; flip the settings test that
   expects github.com to be dropped. Shrink `source-layout.test.js#UNTESTED_BY_DESIGN` by the three
   stubs.
10. **Registries:** `github-url-parser.js` and `github-dom-scraper.js` (in that order, after
    `gitlab-api-repo-provider.js`, before `github-repo-provider.js`) into
    `manifest.json#content_scripts` and `scope.js#SCOPE_FILES`; new names into `EXPORTED_NAMES`.
11. **Docs:** `docs/architecture.md` (diagram, tree, key-files rows), `docs/testing.md` (fixtures,
    covered list, popup-screens), `README.md` (enabling GitHub, public only), `CLAUDE.md` line 3,
    `.claude/skills/live-check/SKILL.md` (GitHub scenarios).

**Acceptance subtask 2:** from the store-shaped build (`npm run package -- --store` still passes):
popup → Enable on github.com → only Chrome's github.com prompt; on a public PR, signed out
(`/files`) and signed in (`/changes`), each changed `.bpmn`/`.dmn` gets one button → differ renders
both versions highlighted, header path opens the GitHub blob; DMN renders under GitHub's CSP;
renamed files open with both sides; blob view button follows soft navigation; a private PR shows
no buttons, logs the reason and does not reload; non-PR GitHub pages make no `api.github.com`
request; GitLab unchanged (live-check catalog).

---

## Subtask 3 — Rich GitHub support, incl. PRIVATE repos + navigation

### 3a. Authentication (PAT) — unblocks private repos

- **Storage:** a GitHub PAT entered by the user via the popup/options UI, stored in
  `chrome.storage.local`. (`storage` permission already granted.)
- **Differ delivery:** the differ tab is `about:blank` with **no `chrome.*`**. Pass the token into
  the differ via the postMessage params (same channel as `camundaBpmnModdle`/`updateInfo`), attached
  in `app.js#openDiffer` only for `kind: 'github'`. **Security note:** the token then lives in the
  differ page's JS memory — acceptable for a local dev tool, but document it; never log it.
- **Fetch seam:** promote `PlatformClient` to own fetching for GitHub so auth headers are applied:
  add `loadFile(ref, path)` (and have `searchCode`/`prChangedFiles` attach
  `Authorization: token <PAT>`). For **private raw content** prefer the Contents API
  (`GET /repos/{o}/{r}/contents/{path}?ref={ref}` with `Accept: application/vnd.github.raw`) —
  `raw.githubusercontent.com` does not reliably accept the `Authorization` header. `GitLabPlatformClient`
  keeps using cookie-session `fetch` (no token), so GitLab is unaffected.
- **Spike first (could avoid a token for content):** the differ tab runs on the github.com origin,
  so a same-origin `fetch('https://github.com/{o}/{r}/raw/{sha}/{path}')` carries the session
  cookie; for a private repo GitHub is expected to redirect to `raw.githubusercontent.com/…?token=…`
  (CORS `*`, allowed by the CSP). If that holds, private **content** needs no PAT — the PR
  metadata (API) still does, unless read from the page. Unverified (needs a private repo);
  public repos already redirect `…/raw/refs/heads/{branch}/{path}` that way.
- Update `DiagramVersions` to load via the client's `loadFile` (instead of `rawFileUrl` + global
  `loadFileContent`) — do this carefully, keeping GitLab byte-for-byte (GitLab `loadFile` just wraps
  today's `loadFileContent(rawFileUrl(...))`).

### 3b. Navigation features on GitHub (best-effort, degraded)

Implement `searchCode`/`prChangedFiles`/`prDiffsUrl` in `GitHubPlatformClient` (`searchPageUrl`
already lands in subtask 2):

- `prChangedFiles`/`prDiffsUrl`: straightforward — `GET /pulls/{n}/files` (paginated) and
  `…/pull/{n}/files`. This enables handler-change detection.
- `searchCode(ref, term)`: `GET /search/code?q={term}+repo:{o}/{r}` (auth required). **Limitations to
  document and handle:** searches the **default branch only** (ignore `ref`, or warn when the PR ref
  differs), ~10 req/min rate limit (rely on the existing per-ref/per-term caches; add backoff on 403
  rate-limit), different relevance/tokenization than GitLab Advanced Search. The exact-term gate
  (BUG-0013) in the locators still applies to the normalized `snippet`.
- `searchPageUrl(term, ref)` → `https://github.com/search?q={term}+repo:{o}/{r}&type=code`.
- Drill-in / callers / decision / correlation locators then work on GitHub via the same neutral
  `searchCode` — but document that results reflect the default branch, so dive-in by an arbitrary PR
  commit may be approximate. `ProcessFileIndex` tree fallback stays GitLab-only (no-op on GitHub).

### 3c. Polish

- Single-commit-selection diff labels on GitHub (mirror FEAT-0001), if desired.
- GitHub Enterprise Server host support (the design already keeps host configurable — add host
  matching + configurable API base URL). Out of scope unless requested.

**Acceptance subtask 3:** with a PAT set, open a **private** GitHub PR with a `.bpmn` → diff renders;
handler badge / dive-in / correlation resolve (within GitHub Search limits); rate-limit handling
degrades gracefully; GitLab unchanged.

---

## Cross-cutting checklist (every step)

- ⚠️ `npm test` green before any push; never commit to master — work on a feature branch per step.
- ⚠️ Keep the four registries in sync (`manifest` content_scripts **order** + web_accessible_resources,
  `utils.js#loadScripts` order, `test/support/scope.js#SCOPE_FILES`); `registries.test.js` enforces it.
- ⚠️ Shared differ classes are used by BOTH BPMN and DMN — when touching `DifferParams`,
  `DiagramVersions`, the orchestrators or the new `PlatformClient`, verify both differs.
- After architecture/file/process changes, update `CLAUDE.md`, `docs/architecture.md`,
  `docs/testing.md`, `docs/conventions.md`.
- Each step = its own MR; merge order 1.1 → 1.2 → 1.3 → 2 → 3 (steps within a subtask can be
  separate MRs too). GitLab behaviour must stay green through the whole sequence.

## Open assumptions to confirm before subtask 3

- PAT stored in `chrome.storage.local`, entered via popup/options, passed into the differ through
  params — acceptable for a local dev extension (token visible in differ JS).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-10-08 · claude-opus-5-5 · branch `feature/refac-0004-github-store-plan` (planning only, no code)

Rewrote **Subtask 2** for Chrome Web Store users: GitHub is enabled at runtime from the popup
through the existing `optional_host_permissions` + the service worker's dynamic registration
(FEAT-0033), so the update needs no new required permission and no manifest permission edit —
the manifest has no `host_permissions` at all. Closed the open questions from the code, GitHub's
docs and live probes of github.com (CSP, CORS, rate-limit headers, both "Files changed" UIs, blob
markup, fork-PR raw access, the compare API) — see "Open questions — resolved". The choices that
are the human's moved to "Decisions pending" (D1–D10), each with a recommendation; the rewritten
steps assume the recommendations. Still open: the signed-in React "Files changed" selectors
(needs one capture, D10). Found three traps the old plan would have shipped (base.sha ≠ merge
base, per-click quota burn, self-reload on API failure) and one leak (`ProcessFileIndex` firing
GitLab API calls on any platform). Added a private-repo spike to 3a. The step-by-step
implementation plan is kept locally in
`docs/superpowers/plans/2026-10-08-refac-0004-github-public-store.md` (untracked).

### 2026-10-03 · claude-opus-5-5 · branch `fix/popup-github-host` ([BUG-0043])

Not progress on this task — a guard while it is unfinished. The popup (FEAT-0033) let users grant
github.com, where the App throws in `createUIRepoProvider` (no UI provider for kind `'github'`).
`isUnsupportedHost` in `src/hosts/host-patterns.js` now refuses `github.com`/`www.github.com` in the
popup and the settings import. **Subtask 2 must remove github.com from `UNSUPPORTED_HOSTNAMES`**
(and its tests) when it flips the GitHub providers on.

### 2026-06-23 · claude-opus-4-8[1m] · step 1.4 (centralize platform detection)

Implemented **step 1.4** — pure refactor, no behaviour change. New file
`src/content/providers/platform-detection.js`: a pure, dependency-free
`detectPlatformKind(location = window.location)` driven by an ordered matcher table
(`github.com` exact host first, then the loose `gitlab` substring) returning the same
`platform.kind` vocabulary the differ scope uses. Switched the three content-scope consumers to it:
`repo-provider-factory.js#createUIRepoProvider` (`detectPlatformKind() === 'github' ? GitHub : GitLab`,
replacing the `window.location.hostname === 'github.com'` hardcode), `GitLabRepoProviderBase.isAvailable()`
(`=== 'gitlab'`, byte-for-byte identical to the former `href.includes('gitlab')` on every gitlab URL),
and `diff-params-builder.js#platform()` (`kind: detectPlatformKind()` instead of the literal `'gitlab'`).

**GitHub providers stay inert** — `github-repo-provider.js`/`github-ui-repo-provider.js` keep their
stub `return false`; the `'github'` matcher entry is dormant until subtask 2 flips them on (no further
factory edits needed then). github.com still does nothing.

Registries: `platform-detection.js` added to `manifest#content_scripts` (after `ui-repo-provider.js`,
before the gitlab providers / factory / `diff-params-builder.js` — it has no deps, loads early) and
`scope.js#SCOPE_FILES` (same relative position) + `EXPORTED_NAMES` (`detectPlatformKind`). **Not** in
`web_accessible_resources` / `utils.js#loadScripts` (those are differ scope). The module has logic, so
it is **not** in `source-layout.test.js#UNTESTED_BY_DESIGN`.

Tests: added `test/content/providers/platform-detection.test.js` (github.com → github; self-managed
gitlab / gitlab.com / loose `gitlab` substring → gitlab; ordering — a github.com URL with `gitlab` in
the path → github; unknown host → null). The `gitlab-repo-provider-base` test stays unchanged (its
scope already runs on a gitlab URL). `diff-params-builder.test.js` updated minimally to create its
scope on a gitlab URL (the builder now reads `detectPlatformKind()` off `window.location`); the
`kind: 'gitlab'` assertions are unchanged. `docs/architecture.md` updated (directory tree, key-files
row, factory row). `npm test` green (1058/1058). **Subtask 1 fully complete** (1.1–1.4); subtasks 2–3
not started.

**Review follow-up (same MR, new commit):** addressed two review notes. (1) Extracted the kind
vocabulary into a `PLATFORM_KIND` constant (`GITLAB`/`GITHUB`) in `platform-detection.js` — the
matchers and all content-scope consumers use it instead of raw `'gitlab'`/`'github'` strings (differ
scope keeps its own literals, separate scope, out of step 1.4). (2) Made the provider-selection sites
"ask the provider" instead of comparing the detected kind themselves: `RepoProvider.isAvailable` and
`UIRepoProvider.isAvailable` now take a `platformKind` argument; `FallbackRepoProvider` and
`createUIRepoProvider` compute `detectPlatformKind()` once and pass it in; `GitLabRepoProviderBase`/
`GitLabUIRepoProvider` answer `platformKind === PLATFORM_KIND.GITLAB`, while the GitHub stubs stay
inert (`return false`, kind ignored). `createUIRepoProvider` returns the
first UI provider whose `isAvailable(kind)` is true and **throws** if none matches (no hardcoded
host→provider mapping, no guessed default — a mismatched provider could not inject buttons anyway; on
matched hosts detection always resolves, so it never fires in practice). Subtask 2 enables GitHub by
flipping its `isAvailable()` with no factory edit. GitLab behaviour still byte-for-byte. Tests updated (base/UI `isAvailable` cases take the kind;
`PLATFORM_KIND` exported from the harness). `npm test` green (1060/1060).

### 2026-06-23 · claude-opus-4-8[1m] · (no commit — planning only) added step 1.4

Authored **Step 1.4 — Centralize platform detection (`detectPlatformKind`)** into Subtask 1, prompted
by review of the `window.location.hostname === 'github.com'` hardcode that step 1.3 introduced in
`createUIRepoProvider`. Found host→platform knowledge scattered across four content-scope sites with
three inconsistent forms (exact host, `includes('gitlab')` substring, stub `false`, literal
`kind: 'gitlab'`). Plan: one pure `src/content/providers/platform-detection.js` with an ordered
matcher table feeding `createUIRepoProvider`, `GitLabRepoProviderBase.isAvailable()`, and
`diff-params-builder#platform().kind` — keyed on the same `platform.kind` vocabulary the differ scope
already uses. No behaviour change (GitLab byte-for-byte identical; GitHub providers stay inert, the
`'github'` matcher dormant until subtask 2). Sequencing decision: land 1.4 **before** subtask 2.
Updated subtask 2 accordingly — step 4 `isAvailable()` now reads `detectPlatformKind() === 'github'`,
step 6 drops the proposed `ProjectInfo.platformKind` field (the detector is the single source of
truth for `kind`), and the matching "Open assumptions" bullet was removed. No code changed this
session.

### 2026-06-23 · claude-opus-4-8[1m] · step 1.3 (inert GitHub stubs)

Implemented **step 1.3** — inert GitHub stubs, no behaviour change, bundled into the same MR !136 as
step 1.2 (per the user's request — a single new commit, not amend/force-push). New files:
`src/content/providers/github/github-repo-provider.js` (`extends RepoProvider`; `isAvailable()`
returns `false`, every other method throws "not implemented yet"), `github-ui-repo-provider.js`
(`extends UIRepoProvider`; `addButton`/`reset` no-ops, `isOwnButtonClick`/`isButtonPresent` return
`false` — safe because `App` calls them unconditionally on the mouseup/popstate hot path),
`src/differ/platform/github-platform-client.js` (`extends PlatformClient`; all methods throw).

Wiring: `repo-provider-factory.js` — `createRepoProvider` appends `new GitHubRepoProvider()` to the
`FallbackRepoProvider` chain (guaranteed-skipped: `init()` only initializes available providers, and
`isAvailable()` is `false`), and `createUIRepoProvider` now selects by host (`github.com` →
`GitHubUIRepoProvider`, else the GitLab default — so nothing changes off github.com).
`platform-client-factory.js` — added `case 'github'` → `GitHubPlatformClient`.

**Deliberately NOT done** (kept the stubs unreachable, per the plan): `https://github.com/*` is not
added to `manifest#content_scripts.matches`, so the content script never even loads on GitHub.

Registries: github content files added to `manifest#content_scripts` (after the GitLab providers,
before fallback/factory — base interfaces still load first) and `scope.js#SCOPE_FILES`;
`github-platform-client.js` added to `manifest#web_accessible_resources`, `utils.js#loadScripts`, and
`scope.js#SCOPE_FILES` (same relative order in all three). The three stubs listed in
`source-layout.test.js#UNTESTED_BY_DESIGN` (no logic to test yet; subtask 2 fills them in + adds
tests). Added a `createPlatformClient(kind:'github')` factory-test case. `docs/architecture.md`
updated (tree, structure diagram, key-files rows). `CLAUDE.md` left unchanged — GitHub is not yet
user-visible (that note lands in subtask 2). `npm test` green (1046/1046). **Subtask 1 (1.1 + 1.2 +
1.3) complete** — GitLab unchanged, GitHub inert. Subtasks 2–3 not started.

### 2026-06-23 · claude-opus-4-8[1m] · step 1.2 (file restructure)

Implemented **step 1.2** — the "nothing actually needs moving" case. Analysis confirmed the layout
is already correct: content-scope neutral files (`repo-provider.js`, `ui-repo-provider.js`,
`repo-provider-factory.js`, `fallback-repo-provider.js`) stay at `src/content/providers/`, all GitLab
specifics are under `src/content/providers/gitlab/`, and `src/differ/platform/` already exists with
its three files registered in all four registries (done in 1.1). So **no `git mv` and no registry
changes** were needed — `registries.test.js` was already green.

Work delivered: (1) the directory-tree + key-files doc update that 1.1 deferred — added the
`platform/` subfolder to the differ tree, three key-files rows (`platform-client.js`,
`gitlab-platform-client.js`, `platform-client-factory.js`), and a "Differ-scope platform seam"
paragraph in `docs/architecture.md`; (2) created `src/content/providers/github/` on disk for 1.3
(empty → not committed, git can't track empty dirs; 1.3 populates it) and recorded it in the tree as
the forthcoming GitHub provider folder. `npm test` green (1027/1027). No behaviour change. Steps
1.3 / subtasks 2–3 not started.

### 2026-06-23 · claude-opus-4-8[1m] · step 1.1 (uncommitted, master working tree)

Implemented **step 1.1** — the differ-scope `PlatformClient` abstraction (pure refactor, GitLab
behaviour unchanged). New files: `src/differ/platform/platform-client.js` (interface, 6 throw-stub
methods), `gitlab-platform-client.js` (verbatim GitLab raw/blob URLs, `searchCode` with the
`/api/v4/.../search?scope=blobs` fetch + response normalisation `path/startline/data` →
`{path, line, snippet}`, `searchPageUrl`, `prChangedFiles` normalising the MR `changes` response to
`{path, oldPath, status}`, `prDiffsUrl`; content loader injectable for tests, defaults to the global
`loadFileContent`), `platform-client-factory.js` (`createPlatformClient` switch on `platform.kind`).

Both orchestrators build `createPlatformClient(this.#params.platform)` and inject it into every
locator (constructors now take the client, not `projectUrl/hostUrl/projectId`) and into
`DiagramVersions`. Locators keep all higher-level logic (caches, exact-term gate/BUG-0013,
classification, `selectCallers` purity) and now read the normalised `snippet`/`line` fields; their
`blobSearchPageUrl`/`blobFileUrl` delegate to the client. `DifferParams.rawFileUrl`/`blobFileUrl`
removed; the `#shownFileFor` and debug-log call sites use the client. `ProcessFileIndex` deliberately
left GitLab-specific (the "doomed" tree-walk fallback — not ported, REFAC-0007).

Four registries synced (manifest `web_accessible_resources`, `utils.js#loadScripts`,
`scope.js#SCOPE_FILES`, + `source-layout.test.js` untested-by-design list for the interface).
Tests: added `gitlab-platform-client.test.js` (URL builders, `searchCode` parsing, `prChangedFiles`
classification) and `platform-client-factory.test.js`; updated locator/differ-params tests to the
normalised hit shape + client injection. `npm test` green (1027/1027). Directory-tree / key-files
doc update is deferred to step 1.2 per plan. **Manual GitLab smoke (Acceptance 1.1) still pending —
to run before push.** Steps 1.2 / 1.3 not started.

### 2026-06-23 · claude-opus-4-8[1m] · (no commit — planning only, master working tree)

Analysed the current architecture for multi-provider readiness and authored the full implementation
plan above. Findings: content scope (App ↔ RepoProvider/UIRepoProvider) is well isolated and
GitHub-ready via the factory; the differ scope leaks GitLab through `DifferParams.rawFileUrl`/
`blobFileUrl` and the 7 navigation locators' inline GitLab Search/URL construction; `platform.kind`
is a dead discriminator. Plan introduces a differ-scope `PlatformClient` seam (mirror of the content
seam) and splits delivery into: subtask 1 (1.1 abstraction / 1.2 file restructure / 1.3 inert GitHub
stubs — no behaviour change), subtask 2 (public-repo basic diff + render, no auth), subtask 3 (PAT
auth for private repos + best-effort navigation within GitHub Code Search limits). Decisions captured:
github.com only, MVP = basic diff + render, restructure as step 1.2. No code changed this session.
