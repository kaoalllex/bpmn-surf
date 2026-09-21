---
id: FEAT-0012
title: Auto-update of the plugin version
priority: high
status: done
---

## Statement

> **Closed on 2026-09-20 as wontfix — the code is removed.** Distribution moved to the
> Chrome Web Store, which updates the extension itself, and no non-store update channel
> is planned. The notifier only ever helped `load unpacked` installs, and [FEAT-0033]
> removed the last reason to distribute those (a self-hosted GitLab host is now added
> from the popup instead of by editing `manifest.json`). History keeps the implementation
> if the decision is ever reversed.

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

### 2026-09-20 · claude-opus-5 · branch `feature/feat-0033-configurable-hosts`

Closed as wontfix and deleted, in the first commit of the FEAT-0033 branch (the two
collide in `manifest.json`, the service worker and the popup; deleting first kept the
feature smaller). Removed: `src/update/` + its tests, `update-service-worker.js`,
`update-indicator.js` + its unit and e2e specs, the root `version.json`, the `updateInfo`
plumbing (`app.js#getUpdateInfo` → params → `setUpdateInfo` in both views and both
orchestrators), the `.differ-update-indicator` styles, the `UPDATE_*` constants in
`config.js`, and the update UI in the popup (which now reads the version from
`chrome.runtime.getManifest()` and links to feedback directly — no service worker).
`manifest.json` lost `background`, `storage`, `alarms`, `host_permissions` and the
`popup.html` WAR entry; `action.default_title` is now `bpmn-surf`. Docs updated:
`architecture.md`, `git-workflow.md`, `.claude/commands/release.md` (no more
`version.json` bump). `npm test` 1125 pass, `npm run test:e2e` 136 pass.

### 2026-09-12 · claude-opus-5 · `67fc6e1`

**The update check is switched off on purpose, not broken.**
`UPDATE_VERSION_MANIFEST_URL` and `UPDATE_CHANGELOG_URL` in `src/core/config.js`
are empty strings, which makes the checker inert — no requests, no errors. They
were emptied because the raw.githubusercontent.com URLs 404 while the repository
is unpublished. To switch the feature back on, fill in the two URLs (the intended
values sit in the comments right above them); nothing else is needed, the origin
is already in `manifest#host_permissions`.

Note the standing limitation: a load-unpacked extension cannot replace its own
files, so this feature notifies and guides — it never updates anything itself.
Real auto-update needs the Chrome Web Store.

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
