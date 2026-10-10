---
id: FEAT-0037
title: GitHub personal access token
priority: low
status: open
---

## Statement

Let the user enter a GitHub personal access token so the differ can use the REST API with
authentication. Only worth doing if the token-free navigation shipped in [REFAC-0004]
(default-branch web search + the pull request's own files) proves not enough: users must be
able to use the extension out of the box, with no manual setup.

## Context

Split out of [REFAC-0004] subtask 3 (decision 2026-10-10: 3b is built without a token). What
a token would add: search on the PR head instead of the default branch only, a higher request
quota, the API fallback provider on private repositories. The text below is the former
"3a. Authentication (PAT)" plan, kept as written.


- **Storage:** a GitHub PAT entered by the user via the popup/options UI, stored in
  `chrome.storage.local`. (`storage` permission already granted.)
- **Differ delivery:** the differ tab is `about:blank` with **no `chrome.*`**. Pass the token into
  the differ via the postMessage params (same channel as `camundaBpmnModdle`/`updateInfo`), attached
  in `app.js#openDiffer` only for `kind: 'github'`. **Security note:** the token then lives in the
  differ page's JS memory — acceptable for a local dev tool, but document it; never log it.
- **Fetch seam:** promote `PlatformClient` to own fetching for GitHub so auth headers are applied:
  add `loadFile(ref, path)` (and have `searchCode`/`prChangedFiles` attach
  `Authorization: token <PAT>`). For **private raw content** prefer the Contents API
  (`GET /repos/{o}/{r}/contents/{path}?ref={ref}` with `Accept: application/vnd.github.raw`) —
  `raw.githubusercontent.com` does not reliably accept the `Authorization` header. `GitLabPlatformClient`
  keeps using cookie-session `fetch` (no token), so GitLab is unaffected.
- Content keeps loading same-origin through `github.com/{o}/{r}/raw/…` (subtask 2; the spike
  confirmed it works for private repositories with the session cookie).
- Update `DiagramVersions` to load via the client's `loadFile` (instead of `rawFileUrl` + global
  `loadFileContent`) — do this carefully, keeping GitLab byte-for-byte (GitLab `loadFile` just wraps
  today's `loadFileContent(rawFileUrl(...))`).


## Work log

<!-- Each AI session on the task — a separate entry by the template in docs/issues/README.md.
     Add new entries on top (freshest first). -->
