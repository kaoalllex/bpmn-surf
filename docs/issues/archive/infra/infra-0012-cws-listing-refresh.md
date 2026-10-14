---
id: INFRA-0012
title: Refresh the Chrome Web Store listing with the next release
priority: medium
status: done
---

## Statement

Do it together with the next store release (after 1.3.0). The listing undersells the
extension: the summary talks only about the MR diff, and none of the screenshots shows how
the extension is reached on a GitLab page.

1. **Summary** — the `description` in `manifest.json` (the store shows it as the summary;
   limit 132 characters, so it changes only with a release). Today: "Review BPMN & DMN
   changes in GitLab merge requests as diagrams, not XML: added, removed and changed elements
   highlighted." Cover the whole product: an interactive diff review (not a static picture),
   plain viewing of any diagram in a repository, navigation into code (task handlers, message
   correlation, called processes and decisions), and the edit mode.
   - Mention **GitHub** only if that release actually ships GitHub support ([REFAC-0004]).
     Naming a platform the extension does not work on is a misleading listing.
2. **Detailed description** — align its first line and section order with the new summary;
   the same GitHub rule applies to "WHERE IT WORKS".
3. **Screenshots** — add one showing the entry points: the "Schema diff" / "Decision diff"
   buttons on diagram files of a merge request and "View schema" with its menu on a
   repository file (the content of `docs/media/buttons.gif`). The store allows at most five
   screenshots and all five slots are taken, so one has to go or be merged into another.
4. **Privacy policy and the first screenshot** — before the store release that ships GitHub
   support, update `PRIVACY.md` (linked from the store listing). Today it says requests go
   only to the GitLab host of the page; with github.com turned on the extension also requests
   `github.com` (PR pages and raw files, same-origin with the session cookie),
   `raw.githubusercontent.com` (where raw requests redirect) and, for signed-out users only,
   `api.github.com` (anonymous REST fallback and changed-handler badges); the same-origin requests added by the navigation work: `/search?…&type=code` (JSON), raw files of the PR's changed files at its head, and `page_data/diff_entries` with a commit range; self-hosted GitHub Enterprise hosts behave the same on their own domain (REST at `{host}/api/v3`); no token, nothing
   stored or sent elsewhere. Verify each claim against the code at release time.
   - `docs/media/popup.png` still shows the old Sites list with gitlab.com built in — retake it.
   - Item 1's summary already changed on branch `feature/refac-0004-github` ([REFAC-0004] D8:
     "Review BPMN & DMN changes in GitLab merge requests and GitHub pull requests as
     diagrams, not XML, with every change highlighted.") — re-check it against item 1's goals
     at release.

## Context

- The store texts and the media list live in the local, untracked `CWS-bpmn-surf.md`;
  the screenshots in `cws-media/screenshots/` (1280×800), recorded by
  `test/e2e/live/record-demo.mjs`.
- Competitor for comparison (`bpmn-io-browser-plugin`): "Render BPMN & DMN diagrams inline on
  GitLab & GitHub, with a before/after diff in merge/pull requests and a standalone viewer."
  It appears to only render the XML as a picture; our summary should make the interactive
  review and the code navigation visible.
- Store listing: https://chromewebstore.google.com/detail/bpmn-surf/baaoelmjlbfjhhkgbfkilgnefegbaldp

## Work log

<!-- Each AI session on the task — a separate entry by the template below.
     Add new entries on top (freshest first). -->

### 2026-10-14 · claude-opus-5-5 · `7e3cbfd` (branch `fix/infra-0012-store-listing`)

Media re-recorded for 1.4.0 with `record-demo.mjs` on the demo MR: all nine README GIFs in
`docs/media/` and the five store screenshots in the local `cws-media/screenshots/`
(`2-buttons.png` included). Every clip and shot
checked by eye against the previous take: same tours, captions and pacing; only the current
UI differs (the floppy-disk download icon). Uploading the texts and screenshots to the store
is the owner's step, outside this task.

### 2026-10-13 · claude-opus-5-5 · branch `fix/infra-0012-store-listing`

Items 1–3 and the popup picture: the name and summary in `manifest.json`, the store texts in
the local `CWS-bpmn-surf.md`. Screenshots (item 3): `record-demo.mjs` shoots `2-buttons.png` (the MR page with the
"Schema diff" button) in place of `2-condition.png`. `docs/media/popup.png` retaken (three
sites, default annotations); the README gains the listener-badge line FEAT-0019 left out.
Remaining: re-record the screenshots, then the owner uploads texts and screenshots.

### 2026-10-13 · claude-opus-5-5 · branch `fix/infra-0012-privacy-github`

Item 4, the privacy policy: `PRIVACY.md` rewritten for GitHub and checked against the code —
the same-origin GitHub requests (raw files redirected to `raw.githubusercontent.com`, the
code search page, the PR page's file list), the anonymous REST fallback (`api.github.com` or
`/api/v3`: no PR payload when signed out, or refs unreadable from the page), and the storage
the old text missed (`siteKinds` in `settings`, `chrome.storage.local` `undetectedSites` and
`gitlabComNotice`). Note for the store's Privacy tab: 1.4.0 drops the built-in gitlab.com
content script of 1.3.0 (every site is optional now) — a reduction, so the update does not
disable the extension, but the host-permission justification should no longer say gitlab.com
is built in. Remaining: items 1–3 and `docs/media/popup.png`.
