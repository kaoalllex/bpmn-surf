# Privacy policy

bpmn-surf is a browser extension that shows BPMN and DMN diagrams in GitLab
repositories and merge requests and compares their versions. It has no server of
its own, collects no analytics and sends nothing to its author.

## What the extension reads

- **GitLab pages** it runs on: gitlab.com and the self-managed GitLab hosts you
  add in the extension popup. It reads the page to find diagram files and to
  place its buttons.
- **Repository data from that GitLab instance**: diagram files, the repository
  tree, commits, merge request changes and code search results, through GitLab's
  own web URLs and REST API. The requests are made from the GitLab page in your
  existing signed-in session, so the extension can see only what your GitLab
  account can see. It does not ask for, read or keep GitLab passwords or tokens.

## What is stored, on your device only

In the GitLab site's `localStorage` (removed together with that site's data):

- `processIdToBpmnFilePathMap#<project>#<ref>#<commit>` — which BPMN file defines
  which process, used to navigate between diagrams;
- `bpmn_diff_master_commits_<project>_<branch>` — the recent commit ids of a branch,
  refreshed after an hour;
- `bpmnDiffer.propsWidth`, `bpmnDiffer.propsHidden` — the width and visibility of
  the properties panel.

In the GitLab tab's `sessionStorage` (removed when the tab is closed):

- `bpmn_diff_reload_attempts` — a counter that stops the extension from reloading
  a page over and over.

In `chrome.storage.sync`:

- `settings` — the external-task handler annotation names you configured. If
  Chrome Sync is on, Chrome itself copies this storage between your signed-in
  Chrome profiles.

The list of GitLab hosts you added is not stored by the extension: it is the set
of site permissions you granted, which Chrome keeps and which you can revoke at
any time in `chrome://extensions`. A settings file you export is saved only
where you choose to save it.

Diagram files fetched for a diff are held in memory while the page is open and
are never written to storage.

## What leaves your browser

- **Requests go only to the GitLab host of the page you are on.** No analytics,
  no telemetry, no advertising, no third-party servers. All libraries ship inside
  the extension; no remote code is loaded.
- **"Report a problem"** — the 💬 button in the diff toolbar opens a new-issue
  form on GitHub (`github.com/kaoalllex/bpmn-surf/issues`) in a new tab, with
  the text prefilled. The prefilled text travels to GitHub inside the link when
  you click the button; nothing is published until you review it and press
  Submit in your own GitHub account. It contains the extension version, the
  GitLab host address, the merge request number, the file name and type, the
  compared versions with their links (project path, branch names, commit ids),
  the edit mode state, and the last lines of the diff tab's console log, which
  can include file paths, links and names from the diagram (process and element
  ids, topic and message names). Diagram content is never included. The
  "Leave feedback" link in the popup opens the issues list and sends nothing.

Data is not sold, shared with anyone or used for anything other than showing
and comparing diagrams.

## Contact

Questions and requests: https://github.com/kaoalllex/bpmn-surf/issues
