---
id: FEAT-0033
title: Configure the GitLab/GitHub hosts the extension runs on, from the popup
priority: medium
status: open
---

## Statement

Let the user add the host of their self-hosted GitLab (or GitHub Enterprise Server)
from the extension's popup, instead of editing `manifest.json` by hand.

Today `content_scripts[0].matches` is baked into the manifest and lists `gitlab.com`
only. A company running its own GitLab has two options, both bad for adoption:

- edit `manifest.json` after downloading the sources (what `README.md` documents
  today) — fine for the person who installed it, a wall for everyone else on the team;
- build a private zip with `npm run package -- gitlab.internal.example`, which
  injects the host into the staged manifest — needs a Node toolchain and someone
  to distribute the result.

Since practically every corporate user of this extension is on a self-hosted
instance, this is the difference between "one developer uses it" and "the team
uses it". It also becomes mandatory rather than convenient if the extension is
ever published to the Chrome Web Store, where `manifest.json` cannot be edited at
all.

## Context

### Mechanism

Chrome cannot take `content_scripts.matches` from configuration — it is read from
the manifest at load time. The supported route is runtime registration:

1. `"permissions": ["scripting", ...]` and
   `"optional_host_permissions": ["https://*/*"]` in the manifest.
2. The list of content-script files moves out of `manifest.json#content_scripts`
   into an array in the service worker (the **order is load-bearing** — it must
   stay in sync with `utils.js#loadScripts`; see `docs/conventions.md`).
3. The popup gets an "add host" field. On submit: `chrome.permissions.request()`
   (needs a user gesture) shows Chrome's own consent dialog for that origin, then
   `chrome.scripting.registerContentScripts()` registers the scripts for it.
   Hosts are stored in `chrome.storage` and re-registered on startup.
4. Removing a host: unregister + `chrome.permissions.remove()`.

Notes for whoever implements this:

- Registration does not reach tabs that are already open — they need a reload.
- `gitlab.com` can stay declarative in the manifest, or become the first entry of
  the configured list; keeping it declarative means existing users see no
  permission prompt after an update.
- The permission being requested is not new in substance: a manifest
  `content_scripts` entry already grants the host permission implicitly at install
  time. This change moves the grant from install time to the moment the user adds
  their own host, which is arguably easier to understand, not harder.
- `platform-detection.js` already resolves the platform by host (exact
  `github.com`, then a loose `gitlab` substring). A configured host must carry its
  platform kind with it, since an arbitrary internal hostname need not contain the
  word "gitlab" — decide whether the user picks the kind in the UI or it is probed.

### Relations

- [REFAC-0004] — the platform abstraction and GitHub support; this task is what
  makes GitHub Enterprise Server and self-hosted GitLab reachable at all.
- [FEAT-0016] — Firefox support: the equivalent API there is
  `browser.scripting` / `browser.permissions`, close enough that this design carries over.
- `scripts/package.sh` keeps working as the build-time path and stays useful for
  distributing a preconfigured internal build; this task removes the need for it.

### Affected files (expected)

- `manifest.json` (permissions, optional host permissions, `content_scripts`),
  `src/background/update-service-worker.js` (or a new registration module),
  `src/popup/popup.{html,js,css}`, `src/core/config.js`,
  `src/content/providers/platform-detection.js`, `README.md`.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
