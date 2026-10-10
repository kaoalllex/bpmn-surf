---
id: INFRA-0012
title: Refresh the Chrome Web Store listing with the next release
priority: medium
status: open
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
