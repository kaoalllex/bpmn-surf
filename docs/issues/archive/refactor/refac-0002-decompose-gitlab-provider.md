---
id: REFAC-0002
title: Decompose gitlab-repo-provider.js by responsibilities
priority: medium
status: done
---

## Statement

Split `gitlab-repo-provider.js` (564 lines — the largest module in the project) by
responsibilities, reducing coupling and preparing the future removal of the
DOM-heuristic path (see `[REFAC-0001]`).

The `GitLabRepoProvider` class currently combines at least 4 roles + infrastructure:

1. **URL/path parsing** — `init` (group/name/host from the URL), `initChangeInfo`
   (iid and API URL by manual string slicing), `extractBranchCommitIdAndFilePath*`
   (commit id and file path via regexes over `href`).
2. **DOM scraping** (tied to GitLab's markup, the most fragile part) —
   `findSelectedFilePath` (legacy + rapid diffs), `getChangeBranchNames`,
   `#findDiffHeadSha`, `#extractBranchCommitIdByDocSelectorCase1/2`,
   the DOM check in `#isMrMerged`.
3. **HTTP/API calls** — `#getProjectId`, loading MR info, `#getMrLastCommitId`,
   the atom feed of master commits.
4. **Heuristic resolution of the target commit of a merged MR** — `getTargetCommitId`,
   `#isMrMerged`, `#findTargetBranchPreviousCommitId`,
   `#findTargetBranchCommitIdByTitle`, `#loadFilteredByTitleMasterCommitEntries`
   (+ `MasterCommitManager`).

Plus: the generic `SingleEntryCache` utility lives right in this file, and the class
duplicates 3–4 ad-hoc caches (init, MR info, target commit, filteredByTitle),
each with its own `#cache/#cacheKey` pair.

## Context

The previous formulation of REFAC-0002 ("simplify/decompose `main.js`, extract
services") is **done** via the "Refac 2" commits: `main.js` is trimmed to a 9-line
entry point, the logic moved out into `app.js`, the providers (UI/API), the differs and
the comparators. The task is reformulated for the remaining largest module.

The link to `[REFAC-0001]` (done) defines a useful cut:

- `GitLabApiRepoProvider` (`gitlab-api-repo-provider.js`) now **extends**
  `GitLabRepoProvider` and reuses the "remaining" (keeper) DOM/URL parts
  (project id resolution, MR/blob page detection, selected-file lookup, branch
  URL parsing), overriding MR-parameter resolution via the GitLab MR API.
- The heuristic commit resolution (role 4) and part of the DOM scraping are candidates for
  **full removal** after the API path is debugged (a separate task from the
  `[REFAC-0001]` TODO).

Therefore the decomposition separates the "remaining" (the shared base for both providers) from
the "doomed" (the DOM heuristic), so that the future teardown of the DOM path becomes a removal
of modules rather than edits inside a large class.

### Accepted design (agreed with the user 2026-06-14)

The two forks are resolved in favor of a cleaner end-state:

- **Base class.** A `GitLabRepoProviderBase` with keeper logic is introduced; both
  `GitLabRepoProvider` (DOM/heuristic) and `GitLabApiRepoProvider` (API) inherit from it.
  This removes the "the API provider inherits the DOM provider" smell (acknowledged
  by the `gitlab-api-repo-provider.js` docstring itself).
- **Depth — full:** 4 new modules + a thin base class.

Target hierarchy:

```
RepoProvider (repo-provider.js, unchanged)
 └ GitLabRepoProviderBase (gitlab-repo-provider-base.js, NEW) — keepers
     ├ GitLabRepoProvider (gitlab-repo-provider.js) — DOM/heuristic path (doomed)
     └ GitLabApiRepoProvider (gitlab-api-repo-provider.js) — API path
```

Collaborators (composition):

| Module (file) | Class | Role | Fate |
|---|---|---|---|
| `single-entry-cache.js` | `SingleEntryCache` | generic "last value by key" | keeper |
| `gitlab-url-parser.js` | `GitLabUrlParser` | **pure** URL/path parsing (no DOM/network) | keeper |
| `gitlab-dom-scraper.js` | `GitLabDomScraper` | all reads of the GitLab page DOM | keeper* |
| `merged-mr-commit-resolver.js` | `MergedMrCommitResolver` | heuristic resolution of the target commit of a merged MR | **doomed** |
| `master-commit-manager.js` | `MasterCommitManager` | exists; used by the resolver | doomed |

\* `GitLabDomScraper` — a keeper overall (its `findSelectedFilePath`/ref-selector
are needed by the API path too), but some methods (`getMergeRequestBranchNames`,
`findDiffHeadSha`, `isMergedByBadge`) are called only by the DOM provider/resolver — they
will go away together with the DOM path.

Links: `[REFAC-0001]` (the API provider and the plan to remove the DOM path),
`[REFAC-0004]` (DTO neutralization and content-loader abstraction).

## Implementation plan (for the next session)

The refactoring is **strictly behavior-preserving**: the public `RepoProvider` interface
does not change, `App`/the differ page/`repo-provider-factory.js`/`FallbackRepoProvider`
are not touched (except, possibly, the order in the manifest). The safety contract — all
existing tests stay green without editing their expectations.

### Distribution of the current `GitLabRepoProvider` members → new locations

| Now (in `GitLabRepoProvider`) | Where it moves |
|---|---|
| `class SingleEntryCache` | → `single-entry-cache.js` |
| `isAvailable`, `init` (+ init cache), `getProjectInfo`, `getChangeInfo`, `isChangeViewActive`, `getBranchFileType`, `findSelectedFilePath`, `extractBranchCommitIdAndFilePath`, `#getProjectId` | → **`GitLabRepoProviderBase`** (keepers) |
| `#findSelectedFilePathLegacy/InRapidDiffs`, `#extractRapidDiffFilePath`, `#findDataPathElements` | → `GitLabDomScraper.findSelectedFilePath()` (+ private) |
| `#extractBranchCommitIdByDocSelectorCase1/2` | → `GitLabDomScraper.findBranchCommitIdText()` |
| `getChangeBranchNames` (DOM `detail-page-description`) | → `GitLabDomScraper.getMergeRequestBranchNames()`; the DOM provider delegates |
| `#findDiffHeadSha` | → `GitLabDomScraper.findDiffHeadSha()` |
| `#extractBranchCommitIdAndFilePathByRegex` | → `GitLabUrlParser.extractBranchCommitIdAndFilePath(href, projectName, hint)` |
| URL slicing in `init`/`initChangeInfo` | → `GitLabUrlParser.parseProject(href)` / `extractMrIid(href)` / `buildMrApiUrl(projectInfo, iid)` |
| `initChangeInfo` (+ MR info cache), `getSourceCommitId`, `#getMrLastCommitId` | → stay in **`GitLabRepoProvider`** (DOM path) |
| `getTargetCommitId` (+ target cache) | → delegates to `MergedMrCommitResolver` |
| `#isMrMerged`, `#findTargetBranchPreviousCommitId`, `#findTargetBranchCommitIdByTitle`, `#loadFilteredByTitleMasterCommitEntries` (+ cache), the `#masterCommitManager` field | → `MergedMrCommitResolver` |

### Contracts of the new modules

**`GitLabUrlParser`** (pure, no DOM/network — therefore easy to unit-test):
- `parseProject(href)` → `{ url, hostUrl, groupName, name }` or `null`
- `extractMrIid(href)` → `string|null` (merges the duplicated `#extractIid`
  of the DOM and API providers)
- `buildMrApiUrl(projectInfo, iid)` → `string` (the logic from `initChangeInfo`)
- `isMrDiffPage(href)` → `boolean`
- `getBranchFileType(href)` → `FileType|null`
- `extractBranchCommitIdAndFilePath(href, projectName, branchCommitIdHint)` →
  `{ branchCommitId, filePath }|null`

**`GitLabDomScraper`** (DOM reads only; tested against jsdom markup, as
`gitlab-repo-provider.test.js` already does):
- `findSelectedFilePath()` (+ private legacy/rapid-diffs helpers)
- `findBranchCommitIdText()` (ref-selector case1/case2)
- `getMergeRequestBranchNames()` → `MergeRequestBranchNames|null`
- `findDiffHeadSha()` → `string|null`
- `isMergedByBadge()` → `boolean`

**`MergedMrCommitResolver`** (all of role 4's heuristic in one place):
- ctor: `(projectInfo, domScraper, masterCommitManager, loadContent)`
- `resolveTargetCommitId(sourceCommitId, changeTitle, targetBranchName, mrInfoUrl)`
  → `string` — carries over the merged/opened branching from `getTargetCommitId`, holds
  the target-commit cache and the `#filteredByTitleMasterCommitEntries` cache
- private: `#isMerged(mrInfoUrl)` (badge via `domScraper.isMergedByBadge()` +
  API via `loadContent(mrInfoUrl)`), `#findPreviousCommitId`,
  `#findCommitIdByTitle`, `#loadFilteredEntries`

**`GitLabRepoProviderBase`**:
- the ctor takes `loadContent = loadFileContent` (DI for tests; the API provider already
  does this), creates `projectInfo`, `mergeRequestInfo`, `urlParser`,
  `domScraper` (the fields are **not** `#`, so subclasses have access — as already done for
  `projectInfo`/`mergeRequestInfo`), an init cache via `SingleEntryCache`
- contains the keeper methods from the table above; `init()` = project id resolution
  (`#getProjectId` via `loadContent`) with a cache — exactly as now

**`GitLabApiRepoProvider`** (after the change):
- `extends GitLabRepoProviderBase` (instead of `GitLabRepoProvider`)
- remove its own `#extractIid`/`#isMrDiffPage` → use
  `this.urlParser`
- keep `#loadMr`/`#mr`/`#mrCacheKey`, override `init` (super.init + an API
  probe), `initChangeInfo`, `getChangeBranchNames`, `getSourceCommitId`,
  `getTargetCommitId`

### Step by step (each step — a separate commit, `npm test` green after each)

0. Record a green `npm test` baseline.
1. **SingleEntryCache** → `single-entry-cache.js`; move the init/MR-info/target
   caches onto it. Behavior identical.
2. **GitLabUrlParser** — extract the pure URL logic; replace the inline parsing in
   both providers (including the duplicated `#extractIid`/`#isMrDiffPage`). + unit tests.
3. **GitLabDomScraper** — extract all DOM reads; the provider delegates.
   The existing DOM tests stay (they hit the provider's public API).
4. **MergedMrCommitResolver** — extract the heuristic from `GitLabRepoProvider`.
   + unit tests (stubs for `fetch`/`localStorage`/`Date.now` are needed — see risks).
5. **GitLabRepoProviderBase** — introduce the base with the keeper methods; `GitLabRepoProvider`
   → DOM/heuristic on top of the base; `GitLabApiRepoProvider` → `extends` the base. Run
   the tests + a manual smoke test (an opened MR on self-managed and on gitlab.com,
   a merged MR, a blob page).

### Accompanying edits (mandatory)

- **`manifest.json`** (`content_scripts`): add 5 files in the correct order
  — `single-entry-cache.js`, `gitlab-url-parser.js`, `gitlab-dom-scraper.js`
  (no dependencies → before the base); `merged-mr-commit-resolver.js` (after
  `master-commit-manager.js`); `gitlab-repo-provider-base.js` (after
  `repo-provider.js` and the three utilities, **before** `gitlab-repo-provider.js`).
  ⚠️ The `content_scripts` order — a guarded change: **agree with the user
  before editing** (the CLAUDE.md rule / `docs/conventions.md`).
- **`test/support/scope.js`**: the same files in `SCOPE_FILES` (the same relative
  order) + the classes in `EXPORTED_NAMES` (`SingleEntryCache`, `GitLabUrlParser`,
  `GitLabDomScraper`, `MergedMrCommitResolver`, `GitLabRepoProviderBase`).
- **Tests**: new `*.test.js` for each extracted module (style —
  `test-design-preferences`: many small ones, public API). The existing
  `gitlab-repo-provider.test.js` / `gitlab-api-repo-provider.test.js` /
  `fallback-repo-provider.test.js` stay green without editing their expectations.
- **`docs/architecture.md`**: update the key-files table (new modules +
  a new description of `gitlab-repo-provider.js`) and the provider hierarchy diagram.

### Risks / what to watch

- **The API provider's `super.init()`**: after the base is introduced, `super.init()` must
  do exactly what the current `GitLabRepoProvider.init` does (project id resolution +
  cache). The API probe stays in the override.
- **Call-order dependency**: `MergedMrCommitResolver.#isMerged` reads
  `mrInfoUrl` (currently `mergeRequestInfo.infoUrl`, set in `initChangeInfo`).
  Check that in the `App` flow `initChangeInfo` is called before `getTargetCommitId`,
  and pass `mrInfoUrl` into `resolveTargetCommitId`.
- **jsdom in the resolver tests**: `MasterCommitManager` uses `localStorage`,
  `fetch`, `Date.now()` — stub/inject them in the resolver unit tests.
- **Subclass access to collaborators**: `urlParser`/`domScraper` on the base are
  ordinary fields (not `#`), since JS has no `protected`; this is consistent with
  `projectInfo`/`mergeRequestInfo` already being public fields.
- **Global `<script>` scope**: the new files must not self-execute code on
  load (unlike `bpmn-differ.js`/`dmn-differ.js`) — class declarations only.

### Prompt to start a new session

> Implement REFAC-0002 following the plan in `docs/issues/refactor/refac-0002-decompose-gitlab-provider.md`.
> The design is already agreed (a shared base `GitLabRepoProviderBase` + full
> decomposition into 4 modules). Proceed step by step (stages 1→5), running
> `npm test` after each. Change the `content_scripts` order in `manifest.json` only after
> the user's explicit confirmation. The behavior of `RepoProvider` does not change;
> the existing tests must stay green. When done — an MR and a Work log
> entry.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (freshest first). -->

### 2026-06-15 · claude-opus-4-8 · branch `refactor/refac-0002-decompose-gitlab-provider`

Implemented the full decomposition per the agreed design (the
`GitLabRepoProviderBase` base + 4 modules), strictly behavior-preserving. Step by step,
`npm test` green after each step (253 tests in total, was 195):

1. `single-entry-cache.js` (`SingleEntryCache`) — the init/MR-info caches moved onto it (`ac46e04`).
2. `gitlab-url-parser.js` (`GitLabUrlParser`) — pure URL parsing; both providers delegate; the duplicated `#extractIid` merged (`0b8ed5c`).
3. `gitlab-dom-scraper.js` (`GitLabDomScraper`) — all DOM reads (`5e15f5f`).
4. `merged-mr-commit-resolver.js` (`MergedMrCommitResolver`) — the merged-MR target-commit heuristic (`a39e113`).
5. `gitlab-repo-provider-base.js` (`GitLabRepoProviderBase`) — the shared keeper base; `GitLabRepoProvider` (DOM/heuristic) and `GitLabApiRepoProvider` (API) now both `extends` it; `loadContent` via DI (`d6aa493`).

Accompanying: the `content_scripts` order in `manifest.json` was updated (with the user's explicit
confirmation) and mirrored in `test/support/scope.js`; new
`*.test.js` for each module; `docs/architecture.md`, `docs/testing.md`,
`.claude/agents/code-explorer.md` updated. The `code-reviewer` review: no blockers, the logic was
ported verbatim. The heuristic DOM path (`GitLabRepoProvider` +
`MergedMrCommitResolver` + part of `GitLabDomScraper`) is now isolated and ready for
future removal (the TODO from `[REFAC-0001]`).
