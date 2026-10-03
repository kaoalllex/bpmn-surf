---
id: BUG-0043
title: The popup lets the user enable the extension on github.com, where it only fails
priority: high
status: done
---

## Statement

The Sites screen of the popup accepted `github.com`: Chrome granted the host permission, the
service worker registered the content scripts there, and on every github.com page the extension
threw on start and showed nothing. GitHub support is unfinished ([REFAC-0004]), so a user — or a
Chrome Web Store reviewer — must not be able to reach that state. Refuse the host until it lands.

## Context

Trace (2026-10-03):

1. `popup.js` submit → `normalizeHostPattern('github.com')` = `https://github.com/*` → nothing
   filtered it → `chrome.permissions.request` (allowed by `optional_host_permissions: https://*/*`)
   → github.com listed as a removable site.
2. `service-worker.js#reconcileHostRegistrations` → registers the full content-script list and
   `content-styles.css` on `https://github.com/*`.
3. Every hard load of a github.com page (PR, blob, anything): `main.js` → `new App()` →
   `createUIRepoProvider()` → `detectPlatformKind()` = `'github'`; `GitHubUIRepoProvider` is an
   inert stub (`isAvailable()` false) and `GitLabUIRepoProvider` accepts only `'gitlab'` → uncaught
   `Error: no UI repo provider for platform kind: github` (confirmed in a vm probe over the manifest
   script list; the same probe constructs the App fine on a self-managed GitLab host). No buttons,
   no differ; the `GitHubRepoProvider` "not implemented" methods and the `GitHubPlatformClient`
   stubs are never reached because the App dies in its constructor. The CSS is scoped to our own
   classes, so the page itself is not affected.
4. The settings import had the same gap: `parseSettingsExport` accepted `github.com` and the popup
   offered an "Allow github.com" button.

No released user has github.com granted: FEAT-0033 (the configurable hosts) is in no release tag
yet, so the service worker needs no clean-up for already-granted origins.

Considered and deferred: probing any newly added host (e.g. `GET /api/v4/version` right after the
permission is granted) and warning when it does not look like GitLab. A non-GitLab host other than
github.com is harmless today — the GitLab providers find no project URL and stay idle — while the
probe would add network/UI states and false warnings (VPN off, SSO redirect, instance down).
Revisit if users report "added a site, nothing happens".

Out of scope: GitHub Enterprise hosts and `gist.github.com` are treated as GitLab like any custom
host (not distinguishable by hostname; they do not hit the crash above).

## Work log

### 2026-10-03 · claude-opus-5-5 · branch `fix/popup-github-host`

Added `isUnsupportedHost(pattern)` to `src/hosts/host-patterns.js` (`github.com`,
`www.github.com`). The popup refuses such a host with "GitHub is not supported yet — bpmn-surf
works with GitLab: gitlab.com and self-managed instances" before any permission request (the check
is synchronous, so the user gesture stays live); `parseSettingsExport` drops it. `manifest.json`,
the service worker and every GitLab path are unchanged. Tests: `host-patterns.test.js` (github.com
in any spelling refused; gitlab.com, self-managed, `github.acme.com`, `notgithub.com` accepted),
`settings.test.js` (import drops github.com). `popup-screens.mjs` now also submits github.com and
reports the refusal and zero permission requests; screenshots checked. `npm test` green (1290/1290).
