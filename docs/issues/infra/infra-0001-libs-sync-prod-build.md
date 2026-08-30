---
id: INFRA-0001
title: Mechanism for pulling in libraries and production build
priority: medium
status: partial
---

## Statement

- ~~Pull libraries via package.json/node.~~ Done: `scripts/sync-libs.js`.
- ~~Replace the used library files with minified versions.~~ Done: dmn-js now takes the
  package's `.production.min.js`, `bpmn-js-properties-panel` (the one package that ships
  no minified build) is minified during `sync:libs` by esbuild.
- ~~Figure out the Inferno error on `dmn-viewer.production.min.js`.~~ Resolved, see the
  work log — it is cosmetic and the dev build is not a fix for it.

Remaining:

- **Remove unnecessary library files** — ~430 KB more, measured but not acted on:
  - `bpmn-embedded.css` (92 KB), `dmn-embedded.css` (36 KB), `bpmn-codes.css` (8 KB),
    `dmn-codes.css` (2 KB) — alternative stylesheets nothing references; `loadScripts`
    loads only `bpmn.css`/`dmn.css`. Safe to drop from the `sync-libs.js` file list.
  - ~294 KB of icon fonts: `bpmn.css` declares `eot`/`woff2`/`woff`/`ttf`/`svg` and the
    browser takes the first it supports, so Chrome uses `.woff2` and the other four are
    dead weight. Dropping them means editing the vendored `@font-face` rule, i.e. a new
    transform in `sync-libs.js` — decide whether that is worth it before starting.
- **Minifying the extension's own scripts is deliberately declined.** The 49 files of
  `src/` are ~460 KB; bundling or minifying them would break the property the project
  relies on — the file in DevTools is byte-for-byte the file in the repo, with no source
  maps. Revisit only if load time is ever measured to be a real problem.

## Context

- Code: `scripts/sync-libs.js`, `manifest.json#web_accessible_resources`,
  `utils.js#loadScripts`.
- Related: [FEAT-0030] needs esbuild in `sync:libs` for a second reason —
  `bpmn-js-token-simulation` publishes ESM sources only and has to be bundled.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-08-29 · claude-opus-5 · branch `feature/feat-0031-bpmn-edit-mode`

Cut `libs/` from 4.9 MB to 3.0 MB — the same bytes ship in the release zip, since
`package.sh` copies `libs/` wholesale.

- **dmn-js: `dmn-viewer.development.js` → `dmn-viewer.production.min.js`** (1.35 MB →
  498 KB). The Inferno message that blocked this earlier is cosmetic. Its check is
  `(testFunc.name || testFunc.toString()).indexOf('testFn') === -1`, and **both** dmn-js
  builds bundle Inferno in development mode — verified by loading each in jsdom: the dev
  build logs `Inferno is in development mode.`, the production one logs that *plus* one
  `console.error` about a "minified copy", purely because dmn-js's minifier mangles the
  `testFn` name that check looks for. So the dev build never bought anything but silence.
  An alternative — minifying the dev build ourselves with `keepNames`, which does silence
  it — was measured at 555 KB and rejected: 57 KB to ship a self-minified development
  artifact instead of the vendor's own tested production one.
- **bpmn-js-properties-panel: minified during sync** (2.4 MB → 1.2 MB). It is the only
  lib with no minified build published. Checked first that minification is safe: all 6 of
  its diagram-js registrations carry an explicit `$inject` and there are no
  `injector.invoke` calls, so mangled argument names cannot break DI; `keepNames` is on
  anyway because the bundle reads `constructor.name` (costs 66 KB).
- Verified beyond the unit suite: both minified libs were loaded in jsdom — `DmnJS` is a
  constructor, `BpmnJSPropertiesPanel` exposes the three modules `bpmn-differ.js` uses,
  and the `$inject` arrays survived. Every path in `manifest.json` and `loadScripts`
  re-checked to resolve on disk. `npm test`: 1175 pass, 0 fail.
- Not verified: the differ has not been opened in a real browser. Worth one manual pass
  over a BPMN diagram (properties panel) and a DMN decision before this is called done.

Deliberately left alone: the 49 sequential `await addScript` calls in `loadScripts`.
They are a serial waterfall and could load in parallel while keeping execution order
(insert all tags with `script.async = false`, then `Promise.all`), but the gain was never
measured, and these are local `chrome-extension://` reads. Measure before touching.
