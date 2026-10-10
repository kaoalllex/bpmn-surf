# Architecture

Chrome Extension (Manifest V3) for visually comparing BPMN 2.0 and DMN diagrams in GitLab merge requests and GitHub pull requests, and in repositories.

## What the project does

- Detects BPMN/DMN files on GitLab and GitHub pages (MR/PR and file view in a repository)
- Loads two versions of a diagram (MR/PR branch vs. target branch) from the platform: the GitLab API, or GitHub's page and same-origin raw URLs
- Renders them with semantic differences highlighted (🟢 added, 🔴 removed)
- Supports comparison against a local file, zoom/pan, "Fit view", a properties panel, and downloading a version

## Directory structure

All application code is under `src/`; the root keeps only `manifest.json`, `CHANGELOG.md`, `PRIVACY.md` (the Chrome Web Store privacy policy), `libs/`, `icons/` (extension icons; placeholder in R1 of the bpmn-surf rebrand, UX-0009), `docs/`, `test/`, `scripts/`, `package*.json`. The layout reflects three script scopes: `core/` (shared), `content/` (the content script for GitLab and GitHub pages), `differ/` (the separate differ tab), plus the extension context — `background/` (service worker) and `popup/` (the window opened from the extension icon), with `hosts/` shared by those two. File names are unique across the whole tree — in the table below the path is not duplicated, lookup is by name.

```
src/
  core/        config.js, models.js, utils.js, console-log.js,
               handler-annotations.js, settings.js          (FEAT-0035),
               github-changes-payload.js
               (cross-scope: data, utilities, the console ring behind the feedback report)
  content/     main.js, app.js, diff-params-builder.js, file-type-detector.js,
               page-reloader.js, camunda-bpmn-moddle-manager.js, content-styles.css
               (content-styles.css — styles for the buttons injected into GitLab's and GitHub's DOM)
    providers/ repo-provider.js, ui-repo-provider.js, platform-detection.js,
               repo-provider-factory.js, fallback-repo-provider.js
      gitlab/  gitlab-repo-provider-base.js, gitlab-api-repo-provider.js,
               gitlab-repo-provider.js, gitlab-ui-repo-provider.js,
               gitlab-url-parser.js, gitlab-dom-scraper.js,
               merged-mr-commit-resolver.js, master-commit-manager.js, single-entry-cache.js
      github/  github-repo-provider-base.js, github-repo-provider.js (page),
               github-api-repo-provider.js (REST fallback), github-url-parser.js,
               github-dom-scraper.js, github-ui-repo-provider.js
  hosts/       host-patterns.js                        (pure match-pattern logic, FEAT-0033)
               content-scripts.json                    (the content scripts' js/css, in load order — the manifest declares none)
  background/  service-worker.js                       (SW: content-script registration for every site the user turned on)
  popup/       popup.html, popup.js, popup.css         (the window opened from the extension icon)
  differ/      styles.css
    shared/    differ-params.js, diagram-versions.js, branch-indicator.js, diff-type.js, camunda-dialect.js,
               differ-loading-overlay.js, differ-empty-state.js, differ-tab-navigator.js,
               feedback-report.js
    bpmn/      bpmn-differ.js, bpmn-differ-view.js, bpmn-xml-comparator.js, diff-highlighter.js,
               changes-table-view.js, properties-panel-highlighter.js, properties-group-expander.js,
               condition-formatter.js, canvas-viewport.js, element-searcher.js, search-panel.js
      edit/    edit-session.js, edit-diff-painter.js, edit-color-control.js,
               edit-color-resolver.js, edit-xml-colorizer.js
               (FEAT-0031 edit mode: session lifecycle, marker layer, colour
               control, and the two pure colour helpers)
    dmn/       dmn-differ.js, dmn-differ-view.js, dmn-table-viewport.js, dmn-xml-comparator.js, dmn-diff-painter.js
    navigation/ call-activity-locator.js, call-activity-navigator.js, caller-locator.js,
               decision-locator.js, decision-navigator.js, decision-caller-locator.js,
               back-navigator.js, handler-locator.js, handler-navigator.js,
               correlation-locator.js, correlation-navigator.js, process-file-index.js
    platform/  platform-client.js, gitlab-platform-client.js, github-platform-client.js,
               platform-client-factory.js
               (differ-scope platform seam, REFAC-0004; mirror of content/providers.
               github-platform-client.js reads the PR page's embedded payload, searches through GitHub's web search and the PR's own files)
```

The paths to these files are listed in four registries that must be kept in sync when moving/adding a file: `src/hosts/content-scripts.json` (the content scripts' `js`/`css`; order is critical; the manifest has no `content_scripts` — the service worker registers this list for every site the user turned on) and `manifest.json#web_accessible_resources`, `utils.js#loadScripts` (names = paths in `web_accessible_resources`, otherwise `chrome.runtime.getURL` returns empty), `test/support/scope.js#SCOPE_FILES`. The registries' synchronicity and the existence of the referenced files on disk are protected by the structural test `test/structure/registries.test.js` (otherwise a desync breaks silently at runtime while unit tests stay green) — see `docs/testing.md`.

## Structure

```
main.js → App (app.js) → Providers → Differs
                          |            ├─ bpmn-differ.js / dmn-differ.js (renders the diff in a separate page)
                          ├─ RepoProvider     (data/detection; interface — repo-provider.js)
                          │     └─ FallbackRepoProvider → [GitLabApiRepoProvider (MR API, primary), GitLabRepoProvider (DOM/heuristics, fallback), GitHubRepoProvider (PR page, primary), GitHubApiRepoProvider (anonymous REST, fallback; REFAC-0004)]
                          │            the two GitLab providers ↑ extend GitLabRepoProviderBase (shared keeper logic)
                          └─ UIRepoProvider   (button injection; interface — ui-repo-provider.js)
                                └─ GitLabUIRepoProvider (GitLab) | GitHubUIRepoProvider (github.com)
```

The `App` core knows nothing about GitLab: it works only through the neutral interfaces `RepoProvider`/`UIRepoProvider`; the concrete implementations are assembled by `repo-provider-factory.js` (`createRepoProvider`/`createUIRepoProvider`) and passed into `App` through its constructor (DI). `FallbackRepoProvider` is a whole-provider fallback: on `init()` it picks the first available and successfully initialized implementation and delegates all calls to it. `GitLabApiRepoProvider` (primary) resolves MR parameters via the GitLab MR API; if on an MR page the API is unavailable / has no `diff_refs`, its `init()` returns `false` and the chain falls back to the DOM/heuristic `GitLabRepoProvider`. Both GitLab providers inherit a shared base, `GitLabRepoProviderBase` (the keeper logic for page detection, URL parsing and project id resolution — what is identical for both paths), and hold collaborators via composition: `GitLabUrlParser` (pure URL/path parsing), `GitLabDomScraper` (all DOM reads of the GitLab page), `SingleEntryCache` (a "last value per key" cache). The DOM path additionally uses `MergedMrCommitResolver` (a heuristic for the target commit of a merged MR; "doomed" along with the DOM path once the API is debugged). GitHub is page-first: `GitHubRepoProvider` reads the refs and file blocks from the PR page (no API request, so a signed-in user and private repositories cost no quota), and `GitHubApiRepoProvider` (anonymous REST) steps in only when the page cannot be read — and only once the page has rendered file blocks, so a still-loading page never burns quota.

Flow: `app.js` listens to `mouseup`/`popstate`, detects the page → the provider resolves commits/branches and loads the content → on an MR diffs view `App` resolves the refs once per URL (origin + path + query) and the UI provider keeps one accented `[icon] Schema diff`/`Decision diff` button in the header of every bpmn/dmn file block (both diff modes, rapid and legacy UI; re-synced on every DOM mutation batch, hidden by CSS while rapid diffs greys out the previous file); in the repo file view it adds a `[icon] View schema`/`View decision` split button whose caret menu holds "Diff with local file…" → on click, `utils.js#openDiffer` opens the diff page, into which the libraries from `libs/` and the differ scripts are loaded. The differ page's parameters are assembled by `diff-params-builder.js` in a neutral form (sourceRef/targetRef/… + a `platform` descriptor), which are parsed and validated by `DifferParams`.

**One Camunda dialect per differ tab** (FEAT-0038). `camunda-bpmn-moddle` and `zeebe-bpmn-moddle` cannot be registered together (both extend the BPMN types with `modelerTemplate`, and moddle then rejects every `bpmn:process`), so `BpmnDiffer.show()` loads the versions first, decides the dialect with `detectCamundaDialect` (C8 if either loaded version is C8), and only then builds the modeler with that one descriptor and properties provider: C8 → `ZeebePropertiesProviderModule` + `params.zeebeBpmnModdle`, C7 → `CamundaPlatformPropertiesProviderModule` + `params.camundaBpmnModdle`. A failed load keeps the C7 modeler and reports exactly as before. The other dialect's attributes stay raw (`$attrs`), so in a 7-vs-8 diff the comparator (XML DOM, not moddle) highlights both sides while the panel and navigation work on the C8 side only. The content script cannot know the dialect (it never reads the XML), so it ships both descriptors in the params. Every dialect-dependent decision reads the differ's one value through an injected getter (`() => this.#dialect`, like `getCurrentRefFunc`).

The BPMN differ page has two modes: view (the default, read-only diff review) and edit (FEAT-0031), opened via the toolbar's `✎` into a second tab where the shown side is directly editable and the live diff against it is painted as CSS markers rather than through the model.

**Three script scopes** (do not confuse them):
1. **Content scripts on GitLab/GitHub pages** — the order is set in `src/hosts/content-scripts.json` (app, providers, utilities).
2. **The differ page** (a separate tab) — scripts are loaded via `utils.js#loadScripts` in the order: `config.js` → `utils.js` → class files → `bpmn-differ.js` → `dmn-differ.js` (`config.js` rides along since FEAT-0024: the feedback button reads `FEEDBACK_URL` here). They all share the single global scope of this tab. A new JS file for the differ page must be added both to `loadScripts` and to the manifest's `web_accessible_resources`. ⚠️ The differ page is a `window.open('about:blank')` (see `utils.js#openDiffer`): an ordinary web context with no access to `chrome.*`. `openDiffer` rewrites the blank document with a doctype first, so the tab renders in **standards mode** like the Layer-2 harness page (an `about:blank` is in quirks mode, where the libraries' CSS broke: FEEL fields as tall as the panel — FEAT-0038). The differ layout is a fixed full-page element at `z-index: 9999`; anything appended to `<body>` above it (the properties panel's pop-up editors, our menus) needs a higher one. Data from "outside" arrives only through postMessage parameters from the content script (addressed to `window.origin` — the effective origin, which the fresh `about:blank` inherits and which `location.origin` reports as `'null'` — the params carry the diagram, and the differ's listener checks the sender's origin in turn; the handshake is pinned by `differ-open-handshake.spec.js`, the one e2e that drives the real `openDiffer`); feedback goes back via `window.opener` or by opening a web-accessible extension page.
3. **The extension context** — the service worker (`background/service-worker.js`) and the popup (`popup/`), both with full access to `chrome.*`; the popup pulls in `core/config.js` + `hosts/host-patterns.js` + `core/handler-annotations.js` + `core/settings.js` via `<script>`, the SW the latter via `importScripts`. These files are NOT part of the four differ/content registries (they live in `manifest#background`/`#action`). **No built-in sites** (FEAT-0033, REFAC-0004): the manifest declares no `content_scripts` and no `host_permissions` — gitlab.com, github.com and a self-managed GitLab are all optional permissions the user grants in the popup, and the SW mirrors the granted origins into one `chrome.scripting` registration whose `js`/`css` come from `src/hosts/content-scripts.json`. A declared (required) host would have made Chrome disable the extension for every existing user until they accepted the new permission. The toolbar icon shows `!` while no site is on, while a site's type is unknown (`undetectedSites`), or while the gitlab.com notice waits (an update from < 1.4.0 that lost gitlab.com — `needsGitlabComNotice`). An internal build bakes its hosts into `host_permissions` of the staged manifest (`scripts/package.sh`); the store build has none. The granted permissions are the list — nothing is stored — so the SW reconciles on `runtime.onInstalled` and `permissions.onAdded/onRemoved`. Handler annotations (FEAT-0035) have no such natural home and DO live in `chrome.storage.sync` (`core/settings.js`); the popup also exports the hosts, their types (`siteKinds`) and the annotations to a JSON file a colleague can import.

**Shared differ-page classes**: `bpmn-differ.js` (`BpmnDiffer`) and `dmn-differ.js` (`DmnDiffer`) are orchestrators, both using the shared classes `DifferParams` (differ-params.js), `DiagramVersions` (diagram-versions.js), `BranchIndicator` (branch-indicator.js), as well as `DiffType` (diff-type.js). There is no global mutable state on the differ page — all state lives in class fields, dependencies are passed through constructors. The one carve-out is `ConsoleLog`'s ring (`console-log.js`, FEAT-0024, see docs/conventions.md): write-only diagnostics, read only by `getConsoleLogTail()`. When changing the shared classes, check both the BPMN and the DMN diff.

**Differ-scope platform seam** (`src/differ/platform/`, REFAC-0004): every platform-specific data access the differ page performs (raw/blob URLs, code search, PR/MR changed-files, the link to one file's diff) is behind the `PlatformClient` interface — the differ mirror of the content scope's `RepoProvider`. Each orchestrator builds one client via `createPlatformClient(params.platform, {changeId, headRef})` (chosen by `platform.kind`; the second argument names the PR/MR shown and its head ref, which GitHub's search uses to read the PR's own files) and injects it into `DiagramVersions` and every navigation locator, which keep their higher-level logic (caches, the exact-term gate, classification) on the normalised hit shape. So the locators carry no GitLab URL knowledge: the handler badge of a changed handler links through `prFileDiffUrl(changeId, filePath)` (the platform owns the anchor scheme: GitLab `?file_path=` + sha1, GitHub `#diff-<sha256>`), and `GitHubPlatformClient` is one more factory case. `ProcessFileIndex` (a GitLab tree walk) runs only for `kind === 'gitlab'`.

## Key files

The per-file reference lives in `docs/architecture/`, one file per area. Open only the area you are changing:

| Area | File |
|------|------|
| `src/content/`: the entry point, `App`, the GitLab and GitHub repo/UI providers. | [`architecture/content.md`](architecture/content.md) |
| `src/differ/bpmn/` (incl. `edit/`): the BPMN orchestrator, view, comparator, highlighting, search, edit mode. | [`architecture/differ-bpmn.md`](architecture/differ-bpmn.md) |
| `src/differ/dmn/`: the DMN orchestrator, view, comparator, painter. | [`architecture/differ-dmn.md`](architecture/differ-dmn.md) |
| `src/differ/navigation/`: dive-in and back navigation — call activities, decisions, handlers, correlations. | [`architecture/differ-navigation.md`](architecture/differ-navigation.md) |
| `src/differ/shared/` (used by both the BPMN and the DMN differ) and `src/differ/platform/` (the differ-scope `PlatformClient`). | [`architecture/differ-shared.md`](architecture/differ-shared.md) |
| `src/core/`, `src/hosts/`, `src/background/`, `src/popup/`, and the repo-level `manifest.json`, `libs/`, `scripts/`, `test/`. | [`architecture/core.md`](architecture/core.md) |
