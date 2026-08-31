---
id: BUG-0002
title: We don't find the target version when a schema file is renamed
priority: high
status: done
---

## Statement

The schema was renamed — no such name exists in master, the diff is not built.

## Context

- Repro: an MR that renames a schema file — the new path exists only in the source branch;
  reproduced on a self-managed GitLab with the legacy (non rapid-diffs) diff markup

### Root of the problem

A **single** `filePath` is threaded through the entire data flow, and it is used for both sides of the diff:

1. `findSelectedFilePath()` (`gitlab-dom-scraper.js`) returns the path as shown on the MR diffs page — this is **`new_path`** (the new name).
2. `app.js#addDiffButton` (`app.js:134`) puts it into `params.filePath` → `DiffParamsBuilder` → `DifferParams.filePath`.
3. `DifferParams.rawFileUrl(ref)` (`differ-params.js:43`) builds the URL `…/-/raw/<ref>/<filePath>` — **with the same `filePath` for both refs**.
4. `DiagramVersions` (`diagram-versions.js:20-25`):
   - `loadMrXml()` → `…/-/raw/<head_sha>/<new_path>` → **OK** (the file with the new name exists in the source branch);
   - `loadBranchXml()` → `…/-/raw/<base_sha>/<new_path>` → **404**, because in the target commit the file is under `old_path`.

Result: `branchXml = null`, `mrXml ≠ null`. It triggers not "both absent" but the UX-0003 branch "target absent" → the new version is shown as a new file, **the diff is not built**.

The rename info is already available but unused for schemas: MR changes API (`old_path`/`new_path`/`renamed_file`, pattern — `handler-locator.js:318-358`, `extractHandlerFileChanges`) and the rapid-diffs DOM `data-file-data` (`gitlab-dom-scraper.js:197`).

## Implementation plan

**Chosen approach (variant A + lazy resolution on click).** Resolve `old_path` via the MR changes API in the provider and thread a separate neutral `targetFilePath` (defaults to = `filePath`) into the differ. When there is no rename — the behavior is **byte-for-byte the same**, only the rename case changes. The differ stays platform-neutral. `getTargetFilePath` is called **lazily in the click handler** of the button (not on the `mouseup` hot path).

Alternatives and reasons for rejection: **B** (DOM `data-file-data` only) — works only on rapid diffs (gitlab.com), does not fix the reported MR on the self-managed gitlab.example.com with legacy markup; **C** (lazy retry on the differ on 404) — drags the GitLab-specific `/changes` call into the neutral differ core; **D** (hybrid A+B) — excessive for now.

### Steps

1. **Pure rename-extraction function** — `gitlab-repo-provider-base.js`, static `extractRenameMap(changesResponse)` (mirroring `extractHandlerFileChanges`): from `changes[]` it assembles `Map(new_path → old_path)` only for rename entries (`renamed_file`, or `new_path !== old_path` and not `new_file`/`deleted_file`).

2. **Provider method** — `GitLabRepoProviderBase.getTargetFilePath(filePath)`:
   - `iid = urlParser.extractMrIid(...)`; no iid → return `filePath` (branch-view, no request);
   - fetches `/api/v4/projects/{id}/merge_requests/{iid}/changes` via `this.loadContent` (cached by URL, like `#mr`/`#commits`);
   - returns `renameMap.get(filePath) || filePath`; any error → `filePath` (safe default = current behavior).
   - Add a default `getTargetFilePath(filePath) → filePath` to the `repo-provider.js` interface (`FallbackRepoProvider` delegates automatically).

3. **Resolution on click** — `app.js#openDiffer` (or the click wrapper in `#addButton`): only for `UI_BUTTON_TYPE.DIFF` do `const targetFilePath = await this.#repoProvider.getTargetFilePath(params.filePath)` and mix it into params before `openDiffer`. The `mouseup` hot path is not touched.

4. **Threading the target-side path:**
   - `DifferParams`: `this.targetFilePath = params.targetFilePath || this.filePath;` + `rawFileUrl(ref, filePath = this.filePath)`. `toNestedDifferParams` — no carry-over (default = `filePath`, the nested differ's behavior unchanged).
   - `DiagramVersions.loadBranchXml()` → `#loadXml(targetRef, params.targetFilePath)`; `loadMrXml()` unchanged.

5. **Tests** (small, public API): `extractRenameMap` (rename / new / deleted / no rename); `getTargetFilePath` (old_path on rename; filePath without rename / without iid / on error; single fetch — caching; via DI `loadContent`); `DifferParams.targetFilePath` default + `rawFileUrl(ref, path)`; `DiagramVersions.loadBranchXml` uses `targetFilePath`; the interface default.

6. **Docs:** update the table in `architecture.md` (DifferParams/DiagramVersions/base/app.js flow), an entry in the "Work log" below, `status: in-progress` for the duration of the work.

### Notes

- No new files (the function is a static on an existing base) → registries/`manifest.json` are not touched.
- `/changes` is formally deprecated but works on our GitLab and is already used in `handler-locator` — we take it for consistency; on large MRs this is one cacheable request per click.
- The download name for the target version will stay the new one (`fileName`); if desired, a separate `targetFileName` later (out of scope of this fix).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (freshest first). -->

### 2026-06-17 · claude-opus-4-8 · branch `fix/bug-0002-target-version-renamed-file`

Follow-up on the note (previously marked "out of scope"): on a rename, show the file name corresponding to the side and use it when downloading.

- `differ-params.js`: field `targetFileName` = basename(`targetFilePath`) (default = `fileName`).
- `diagram-versions.js`: `download(content, branchName, fileName=params.fileName)` — the name is passed by the caller.
- `bpmn-differ-view.js` / `dmn-differ-view.js`: `setFileName(name)` updates the name in the header (a reference to the span is kept).
- `bpmn-differ.js` / `dmn-differ.js`: in `#showMr` → `fileName`, in `#showBranch` / `#showAbsentSide(target)` → `targetFileName`; downloading the target side — with `targetFileName`. Without a rename the names match → behavior unchanged.
- Tests (+2): `DifferParams.targetFileName` (default + basename on rename). All 704 green.

### 2026-06-17 · claude-opus-4-8 · branch `fix/bug-0002-target-version-renamed-file`

Implemented the chosen approach (variant A + lazy resolution on click):

- `gitlab-repo-provider-base.js`: static `extractRenameMap(changesResponse)` (Map `new_path → old_path` only for renames) + method `getTargetFilePath(filePath)` (resolution via the MR `/changes` API, cached by URL in `#renameMaps`; no iid / no rename / error → `filePath`).
- `repo-provider.js`: interface default `getTargetFilePath(filePath) → filePath` (identity). `FallbackRepoProvider`: explicit delegation to the active provider (it has no auto-Proxy — all methods are delegated manually).
- `app.js#openDiffer`: for `UI_BUTTON_TYPE.DIFF`, lazily resolves `targetFilePath` on click (off the `mouseup` hot path) and mixes it into params only when it differs from `filePath`.
- `differ-params.js`: field `targetFilePath` (default = `filePath`) + `rawFileUrl(ref, filePath=this.filePath)`. `toNestedDifferParams` unchanged.
- `diagram-versions.js`: `loadBranchXml()` loads the target by `params.targetFilePath`; `loadMrXml()` — by `filePath`.

Tests (+12, all 702 green): `extractRenameMap` (rename / no flag / new+deleted+unchanged / empty response), `getTargetFilePath` (old_path on rename; filePath without rename / without iid no request / on error; single fetch — caching), `DifferParams` (`targetFilePath` default + explicit; `rawFileUrl(ref, path)`).

Deviation from the plan: a separate unit test `DiagramVersions.loadBranchXml` was not added — the class is in `UNTESTED_BY_DESIGN` (tied to the global `loadFileContent` without DI), and its new behavior is fully determined by the tested `DifferParams.rawFileUrl(ref, filePath)`. DI refactoring of `DiagramVersions` is out of scope of the minimal fix.
