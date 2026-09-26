---
id: BUG-0041
title: The MR diff button opens the previous file when clicked mid-switch
priority: high
status: done
---

## Statement

With "Show one file at a time" on, switching to another file in the tree and quickly
clicking "Schema diff"/"Decision diff" can open the **previous** file's diagram
instead of the one now on screen.

## Context

[BUG-0036] made the button follow the selected file, but as a side effect removed the
unconditional `reset()` that used to run at the top of every `#doStart` — which had
been keeping the button out of the DOM (and therefore unclickable) for the whole
async re-check. Once that button-carries-a-closure design stayed but the
button was no longer removed during the re-check, the window it is stale-but-present
opened up.

Measured live against [bpmn-surf-test MR !12](https://gitlab.com/kao.alllex/bpmn-surf-test/-/merge_requests/12/diffs)
with Playwright (profile signed in as `kao.alllex`, "Show one file at a time" on):
switching from `Fulfillment.bpmn` to `Delivery.bpmn`, the button stayed enabled and
pointed at `Fulfillment.bpmn` from ~240ms to ~1200ms after the click, while GitLab's
own DOM already showed `Delivery.bpmn` from ~500ms — the debounced `MutationObserver`
that eventually rebuilds the button (`#DOM_RETRIGGER_DELAY_MS`) waits for GitLab's DOM
to go fully quiet, which took close to a second on this MR.

## Work log

### 2026-09-26 · claude-sonnet-5 · branch `fix/mr-review-differ-issues`

Two-layered fix:

- `UIRepoProvider` (+ `GitLabUIRepoProvider`, `GitHubUIRepoProvider` no-op) gained
  `disableButton()`/`enableButton()`. `App#doStart` disables the button synchronously
  at the very top (where the unconditional `reset()` used to run) and re-enables it in
  a `finally`. Toggling `disabled` is not a `childList` mutation, so the DOM-change
  observer never sees it and cannot retrigger itself over it — no repeat of
  [BUG-0036]'s blink loop. This narrows the window but, per the measurement above,
  does not close it: the app's own re-check can conclude "nothing changed" (and
  re-enable) before GitLab's DOM actually catches up.
- The actual guard: `App#openDiffer` now checks, at click time, whether the file the
  page shows **right now** (`#shownFilePath()`, a fresh lookup) still matches the
  file the clicked button's closure was built for; if not, the click is ignored.

Verified live with Playwright against MR !12: a synthetic click on the button at
~320ms after switching files (well inside the previously-observed stale window) now
logs `stale button click ignored: page now shows .../Delivery.bpmn, button was for
.../Fulfillment.bpmn` and opens no tab; a click on an up-to-date button still opens
the differ normally. `npm test` green.

Files: `src/content/app.js`, `src/content/providers/ui-repo-provider.js`,
`src/content/providers/gitlab/gitlab-ui-repo-provider.js`,
`src/content/providers/github/github-ui-repo-provider.js`.
