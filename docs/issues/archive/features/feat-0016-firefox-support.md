---
id: FEAT-0016
title: FireFox support
priority: low
status: done
---

## Statement

Make the extension work not only in Chrome but also in FireFox.

## Context

- Currently the extension is a Chrome Extension (Manifest V3), relying on the `chrome.*` API.
- No polyfill is needed: Firefox MV3 serves the promise-based `chrome.*` namespace, and every API the extension calls exists there. The differences are the manifest (patched into the Firefox build by `scripts/package.sh --firefox`) and the differ tab a content script opens (see the Work log).
- Orthogonal to [REFAC-0004] (abstraction of the code storage platform GitLab→GitHub — that's about the data source, not the browser).

## Work log

<!-- Each AI session on the task is a separate entry per the template below.
     Add new entries at the top (freshest first). -->

### 2026-10-18 · claude-opus-5-5 · branch `feature/firefox-support`

- `npm run package -- --firefox` → `dist/bpmn-surf-<version>-firefox.zip`: the store layout with the Firefox keys patched into the staged manifest only — `background.scripts` (an event page; `host-patterns.js` first, as Firefox has no `importScripts`, now guarded in `service-worker.js`), `browser_specific_settings.gecko` (id `bpmn-surf@kaoalllex`, `strict_min_version` 140, `data_collection_permissions: none`), a name within AMO's 45 characters. `npx web-ext lint`: 0 errors; the warnings are `innerHTML` with constant markup and the minified `libs/`. The Edge Add-ons upload is the CWS zip unchanged.
- Differ tab in Firefox: a tab a content script opens with `window.open` gets no origin the script may touch (`SecurityError` on `document`), and `document.open` through the Xray view is refused. `openBlankTab` (`utils.js`) opens it through the page (`window.wrappedJSObject`), `openDiffer` rewrites it through the page's document; Chrome takes the old path.
- Checked in Firefox 158 over WebDriver BiDi on the demo project (anonymous): the MR diff for BPMN and DMN on GitLab and GitHub, the blob-view button, dive-in into a called diagram, the edit tab. Anonymous gitlab.com answers "Rate limit exceeded" after a few runs — a page with no buttons is that, not the extension.
- The Firefox manifest moved into `scripts/firefox-manifest.js` (the worker's `importScripts` become the leading `background.scripts`), tested by `test/structure/firefox-manifest.test.js`. The live check is `test/e2e/live/firefox-smoke.mjs` (WebDriver BiDi, the demo project signed out), part of the release smoke; with the `openBlankTab` fix reverted it fails on the reported "tab opens and closes". The browser-differences rule is in `docs/conventions.md` and the code-reviewer checklist.
- Not covered: Firefox for Android, a signed-in Firefox session (code search), the Firefox popup's permission prompt (manual).
