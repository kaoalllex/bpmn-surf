# BPMN Diff

Browser extension for viewing and visually comparing BPMN 2.0 and DMN diagrams in GitLab.

## Requirements

- Google Chrome
- Other Chromium browsers with support for Chrome Extension Manifest V3

## Installation

The recommended way is from a git clone: then updating comes down to `git pull` + a reload (see "Updating").

```bash
git clone <repo-url> ~/tools/bpmn-diff   # folder is up to you
```

1. Open the extensions page: `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click the **Load unpacked** button
4. Select the clone folder (for example `~/tools/bpmn-diff`) — the extension needs no build, it runs straight from the sources

## Updating

The extension checks for new versions itself and shows a notification: a badge on the icon, a window on clicking the icon (what's new, an update button, an auto-check toggle), and a "🔔 vX" mark in the toolbar of the comparison window. The check only reads the public `version.json`, no data is sent; auto-check can be turned off.

Apply an update (for a git install):

```bash
cd ~/tools/bpmn-diff && git pull
```

then in the update window click **"Reload extension"** — it will re-read the files from disk (or manually click ⟳ on the extension in `chrome://extensions`). The extension does not replace its own files on its own (a limitation of "Load unpacked" mode) — it only notifies and walks you through the steps.

> Auto-check is activated when the `UPDATE_*` URLs of the public version source are set in `src/core/config.js` (see the comment there). Until then the extension works as usual, just without update checks.

## Features

- Comparing two versions of BPMN/DMN diagrams in a GitLab MR (MR branch vs. target branch)
- Comparing against local files
- Highlighting changes: added, removed, and modified elements
- A changes table with navigation to an element on click
- Switching between versions (switch branch) and downloading any of the versions
- Zoom and navigation controls (zoom/pan, "Fit view")
- A properties panel for viewing element details, including sequence flow conditions
- Navigating into the diagram of the called process from a Call Activity ("Dive in")

### Comparing in an MR

1. Open a merge request in GitLab containing changes to BPMN/DMN files
2. A **Show schema diff** (for BPMN) or **Show decision diff** (for DMN) button appears on the MR page
3. Click the button — a page with a visual comparison of the two diagram versions opens
4. Changed elements will be highlighted:
   - 🟢 Green — added elements
   - 🔴 Red — removed elements

### Viewing a schema in the repository

1. Open a `.bpmn` or `.dmn` file in a GitLab project
2. Buttons appear next to the file name:
   - **Show schema** / **Show decision** — open the diagram for viewing
   - **Show diff with local** — compare against a local version of the file

## Technologies

Vanilla JavaScript (ES6+), without frameworks and without a build step. Libraries used (vendored in `libs/`, see "Updating libraries"):
- [bpmn-js](https://github.com/bpmn-io/bpmn-js) — BPMN diagram visualization
- [dmn-js](https://github.com/bpmn-io/dmn-js) — DMN decision visualization
- [bpmn-js-properties-panel](https://github.com/bpmn-io/bpmn-js-properties-panel) — element properties panel
- [camunda-bpmn-moddle](https://github.com/camunda/camunda-bpmn-moddle) — Camunda extensions of BPMN models

## Development

There are no runtime dependencies — the extension is loaded unpacked straight from the repository root (see "Installation"). Dev dependencies are needed for unit tests (`jsdom`) and for syncing `libs/`:

```bash
npm install
```

### Updating libraries

Files in `libs/` are not edited by hand — they are copied from npm packages by a script:

```bash
# 1. change the package version in package.json#devDependencies
npm install
npm run sync:libs
# 2. review the diff of libs/, run npm test, check the extension in the browser
```

Which files are copied and from where is defined declaratively in `scripts/sync-libs.js`. Details and nuances — `docs/conventions.md`.

### Tests

```bash
npm test
```

The runner is the built-in `node:test`, a run takes ~0.5 sec. Run before every push — there is no CI pipeline in the project yet. More about how the tests are built — `docs/testing.md`.

### GitLab CLI (glab)

[glab](https://gitlab.com/gitlab-org/cli) is used for working with MRs. Installation on macOS:

```bash
brew install glab
glab auth login --hostname gitlab.example.com
```

For authorization you will need an access token with `api`, `read_repository`, `write_repository` rights.

### Workflow with git worktree (parallel Claude Code sessions)

Each task is done in a separate branch `feature/<task>` or `fix/<task>` off a fresh `origin/master`; master is protected, merging is only through an MR after review. Full rules — `docs/git-workflow.md`.

For parallel work of several Claude Code sessions, git worktrees are used — one per task:

```bash
# create a worktree for a task
git fetch origin
git worktree add ../<dir> -b feature/<task> origin/master

# launch Claude Code inside it
cd ../<dir> && claude

# view changes: open the directory in an editor, or
git diff origin/master...feature/<task>   # committed changes of the branch
git -C <dir> diff                         # uncommitted changes in the worktree

# list worktrees
git worktree list

# remove a worktree after merging the MR
git worktree remove <dir>
```

## Links

- [Chat channel](https://chat.example.com/example/channels/bpmn-diff)
