---
id: FEAT-0012
title: Auto-update of the plugin version
priority: high
status: partial
---

## Statement

Goals: not force manual updates; notify about new versions.

The user should: see a notification about a new version and, if desired, trigger the
update; see "what's new"; be able to turn off auto-update. The key point —
full transparency (user trust) and not breaking the current functionality.

## Context

Decision (based on an analysis of modern approaches): an **embedded notifier**
on top of `load unpacked`. By design, an extension cannot replace its own files
itself (there is no API), so this is a notification + a guided update (`git pull` +
`chrome.runtime.reload`), not a silent auto-update. The version source is a public
`version.json` (+ `CHANGELOG.md`), decoupled from the code: we announce a version only
when the artifact is actually available.

Alternatives (silent auto-update) are documented as future distribution upgrades
that require IT/Google rather than code: self-hosted CRX + a corporate
policy (`override_update_url`, force-install via MDM) and the Chrome Web Store
(unlisted). Related to moving the sources to a public GitHub.

Architecture: a third script scope (extension-context) — the service worker
`src/background/update-service-worker.js` (checks via `chrome.alarms`, badge,
state in `chrome.storage.local`) and the popup `src/popup/` (UI). Pure logic —
`src/update/version-info.js` + `src/update/update-checker.js` (unit tests).
The toolbar indicator in the differ — the shared `src/differ/shared/update-indicator.js`
(the differ page without `chrome.*`: `updateInfo` arrives in params from the content-script,
a click opens the popup as a web-accessible tab). Config — `config.js#UPDATE_*`.
Affected: `manifest.json` (action/background/permissions storage+alarms/
host_permissions/WAR), `utils.js#loadScripts`, `app.js#openDiffer`,
`bpmn-differ.js`/`dmn-differ.js`, both differ views, `styles.css`, the `release` skill,
README, `docs/architecture.md`.

Remaining (why `partial`):
- fill in `UPDATE_VERSION_MANIFEST_URL`/`UPDATE_CHANGELOG_URL`/`UPDATE_HOME_URL`
  in `config.js` after the move to the public GitHub (until then the feature is inert — a no-op);
- manual end-to-end check against a live source (badge · popup · "what's new" ·
  indicator in the differ · reload via `runtime.reload`);
- optionally — a branded action icon (the badge currently works on the default one).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries at the top (most recent first). -->

### 2026-06-17 · claude-opus-4-8 · branch `feature/feat-0012-auto-update`

Implemented the embedded update notifier. Pure version/changelog logic
(`version-info.js`, `update-checker.js`) with unit tests; service worker
(check via alarms, badge, storage); popup (versions, "what's new", `git pull`
copy + reload, auto-check toggle, explicit source URL + "no data is
sent"); a "🔔 vX" indicator in the BPMN/DMN differ toolbar (shared
`UpdateIndicator`, flow via params + `window.open` of the popup). manifest:
`action`/`background`/`storage`+`alarms`/`host_permissions`/WAR `popup.html`.
The `release` skill bumps `version.json` and writes `CHANGELOG.md`. `npm test` — green
(764). Content_scripts and the differ pipeline are untouched. Activation — after setting
the `UPDATE_*` URLs (move to GitHub) + a manual check → then `done`.
