---
name: live-check
description: Use when asked to check the extension live, by hand, end to end or on the test sandbox — "проведи live-проверку", "проверь на песочнице", "ручная проверка", "live check", "does it work on real GitLab" — before declaring done a change to how the extension reads or decorates GitLab or GitHub pages (buttons, file detection, placement), to the differ's navigation or code search, or to how differ tabs open — and before every release or store submission (the release smoke). Not for running unit or Layer-2 e2e tests.
---

# Live check on the sandbox

## Overview

A hands-on check of the **real extension** in a real Chromium, signed in, against
`https://gitlab.com/kao.alllex/bpmn-surf-test`, driven by the scripts in
`test/e2e/live/`. It catches what unit tests cannot: GitLab's live markup,
timing and per-user preferences. It needs Claude, the signed-in profile and
gitlab.com, so it is never a CI gate.

## First: does this change need a live run?

Only what touches **GitLab itself** does: its page, its code search API, or the
browser's handling of the tabs we open. Otherwise the differ tab takes nothing from
GitLab but two XML files: the comparator, the painters, the properties panel, the
changes table, search and edit mode all run the same in the offline Layer-2 harness,
with the real bpmn-js and properties panel (`docs/testing.md`, `test/e2e/*.spec.js`).

| The change is in | Check it with |
|---|---|
| `src/content/` — buttons, file detection, placement, SPA navigation | `catalog/buttons.md` (GitLab); `src/content/providers/github/`, `src/differ/platform/github-platform-client.js`, `src/core/github-changes-payload.js` — `catalog/github.md` |
| the differ (`src/differ/`) | the Layer-2 spec of that area (`differ-edit-*`, `differ-prop-group-*`, `differ-highlight-*`, `dmn-*`…): add a case that fails without the fix. For a diagram from a report, pull it first (`gitlab-test-project` skill, "From report to repro") |
| `src/differ/navigation/`, `src/differ/platform/` — dive-in, callers, badges, code search | Layer-2 spec of that area **and** `catalog/differ-navigation.md` (the search is mocked offline) |
| how differ tabs open — `openDiffer` (`src/core/utils.js`), `src/differ/shared/differ-tab-navigator.js` | `mr-button --click`, `branch-button`, and `catalog/differ-navigation.md` |
| `src/popup/`, `src/background/`, `src/hosts/` | `node test/e2e/live/popup-screens.mjs <scratchpad>` (offline) and the screenshots; the site-warning scenario in `catalog/github.md` |
| a release, a store submission | "Release smoke" below |

Asked for a live check of a differ-only change: say so, run the Layer-2 spec, and
report that as the check, not an empty live run.

## Release smoke

Before every release (the `release/vX.Y.Z` PR) and before a store submission, run
this set on the release branch, all against fresh MR iids resolved by kind:

1. MR buttons, "Show one file at a time" **on**: bpmn + code (plain and `--legacy`);
   bpmn + dmn, `--click` (plain and `--legacy`); a `.dmn` `--click`; an added, a deleted
   and a renamed diagram; a nested-subprocess change `--click`; code only.
2. The same with the setting **off**: bpmn + code (plain and `--legacy`), bpmn + dmn
   `--click`, many files `--scroll` (plain and `--legacy`). Set the preference back.
3. Branch view: a `.bpmn` and a `.dmn` on `main`, a file on a branch with a slash.
4. Search fallback link (`search-page.mjs`) and the popup (`popup-screens.mjs`).
5. Differ navigation (`record-demo.mjs … --no-video`), ~6 min.
6. GitHub, all of `catalog/github.md`.
6a. Camunda 8, all of `catalog/camunda8.md`, on GitLab and on GitHub.
7. By hand, for the human: adding a site in the popup (Chrome's permission dialog
   cannot be automated), and the upgrade check from the previous store build.

## Prerequisites

1. Signed-in profile: `node test/e2e/live/diff-mode.mjs` prints `signed in as: …`.
   If it says the profile is signed out, ask the human to run
   `node test/e2e/live/capture-login.mjs` and tick **Remember me**.
2. Sandbox API token: see the `gitlab-test-project` skill (recipes, and why
   nothing about the sandbox's contents is stable).
3. **One script at a time** — they share one Chromium profile.

## The demo project is not the sandbox

`https://gitlab.com/kao.alllex/bpmn-surf-demo` is a **frozen showcase**: the store
reviewer instructions, the README GIF and the screenshots depend on it. Live checks
run on the sandbox. On the demo, run only the read-only scripts
(`BPMN_SURF_PROJECT=<demo url>`) and `record-demo.mjs`. Never "create through the API what is missing" there. It
is also where to answer "does it work signed out?" (`BPMN_SURF_ANONYMOUS=1`). The
rules, the token and the MR lookup are in `test/e2e/live/README.md`, "The demo project".

## Rules

- **Resolve, never assume.** List MRs (`$B/merge_requests?state=all`) and their
  `/changes` at run time and pick MRs by kind. Never reuse iids from memory,
  docs or an earlier session.
- **Restore what you change.** Record `diff-mode.mjs`'s value before, set it
  with `diff-mode.mjs on|off`, and set it back at the end (and confirm it reads
  back). UI and compare view are URL flags (`--legacy`, `--parallel`): nothing
  to restore.
- **New test material only through the API** (`POST /repository/commits`,
  `POST /merge_requests`), never a clone or push.
- **Screenshots go to the session scratchpad**; open each with Read — the
  runner checks structure, you check looks.
- The harness loads the extension from the working tree on every launch: no
  reload step, but it tests *uncommitted* code too.

## Report

Per cell: the command, `RESULT: OK` or the `FAIL` lines, and any screenshot that
looks wrong (what, where). End with the preference values you restored.

## Catalog

One file per area — open only the one the change needs. Camunda 7 is the baseline dialect:
every file except `camunda8.md` runs on C7 material (the sandbox's `order-service/`, the demo
project), and `camunda8.md` is the C8 delta, ending with a C7 regression row. C7-specific
expectations (the C7 panel groups, `camunda:topic` badges) are not catalogued yet — [INFRA-0011].

| Area | File |
|---|---|
| MR and branch-view buttons | [`catalog/buttons.md`](catalog/buttons.md) |
| Search fallback link | [`catalog/search-fallback.md`](catalog/search-fallback.md) |
| Differ navigation (signed in) | [`catalog/differ-navigation.md`](catalog/differ-navigation.md) |
| GitHub | [`catalog/github.md`](catalog/github.md) |
| Camunda 8 (FEAT-0038) | [`catalog/camunda8.md`](catalog/camunda8.md) |

### Other areas

Not catalogued yet — see [INFRA-0011].

## Common mistakes

- Running two scripts at once: the second fails to open the locked profile.
- Leaving "Show one file at a time" flipped: it is the human's own account
  setting.
- Judging from `RESULT: OK` alone: it says nothing about how the button looks.
- Looping over flag sets in zsh with an unquoted `$flags`: zsh does not split
  it, the script gets one unknown argument and silently runs the plain rapid
  cell. Loop in `bash -c` or spell each command out. Check the `ui=` in the
  first output line.
