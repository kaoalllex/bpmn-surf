---
name: live-check
description: Use when asked to check the extension live, by hand, end to end or on the test sandbox — "проведи live-проверку", "проверь на песочнице", "ручная проверка", "live check", "does it work on real GitLab" — or before declaring done a change to how the extension reads or decorates GitLab pages (buttons, file detection, placement). Not for running unit or Layer-2 e2e tests.
---

# Live check on the sandbox

## Overview

A hands-on check of the **real extension** in a real Chromium, signed in, against
`https://gitlab.com/kao.alllex/bpmn-surf-test`, driven by the scripts in
`test/e2e/live/`. It catches what unit tests cannot: GitLab's live markup,
timing and per-user preferences. It needs Claude, the signed-in profile and
gitlab.com, so it is never a CI gate.

## First: does this change need a live run?

Only what touches **GitLab's page** does. The differ tab takes nothing from GitLab
but two XML files: the comparator, the painters, the properties panel, the changes
table, search and edit mode all run the same in the offline Layer-2 harness, with the
real bpmn-js and properties panel (`docs/testing.md`, `test/e2e/*.spec.js`).

| The change is in | Check it with |
|---|---|
| `src/content/` — buttons, file detection, placement, SPA navigation | the catalog below |
| the differ (`src/differ/`) | the Layer-2 spec of that area (`differ-edit-*`, `differ-prop-group-*`, `differ-highlight-*`, `dmn-*`…): add a case that fails without the fix. For a diagram from a report, pull it first (`gitlab-test-project` skill, "From report to repro") |
| `src/popup/` | `node test/e2e/live/popup-screens.mjs <scratchpad>` (offline) and the screenshots |

Asked for a live check of a differ-only change: say so, run the Layer-2 spec, and
report that as the check, not an empty live run.

## Prerequisites

1. Signed-in profile: `node test/e2e/live/diff-mode.mjs` prints `signed in as: …`.
   If it says the profile is signed out, ask the human to run
   `node test/e2e/live/capture-login.mjs` and tick **Remember me**.
2. Sandbox API token: see the `gitlab-test-project` skill (recipes, and why
   nothing about the sandbox's contents is stable).
3. **One script at a time** — they share one Chromium profile.

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

### MR and branch-view buttons

Every bpmn/dmn file block of an MR diff carries one `[icon] Schema diff` /
`Decision diff` button before its ⋮ menu; the blob view has a `[icon] View
schema` / `View decision` split button whose caret menu holds "Diff with local
file…".

**Matrix** — for each diff mode (`diff-mode.mjs on`, then `off`), for each MR
kind below, run all four:

```bash
S=<scratchpad>/live
node test/e2e/live/mr-button.mjs <iid> --shots $S
node test/e2e/live/mr-button.mjs <iid> --legacy --shots $S
node test/e2e/live/mr-button.mjs <iid> --parallel
node test/e2e/live/mr-button.mjs <iid> --legacy --parallel
```

**MR kinds** (pick one each from the listing; create through the API what is
missing): a modified diagram next to code; an added diagram; a deleted one; a
renamed one; a `.dmn`; bpmn + dmn together; a merged MR; many files (≥25, with
diagrams among them — exercises lazy rendering and the legacy virtual
scroller); code only (expect zero buttons).

**Once per diff mode:** `--walk` and `--walk --legacy` on an MR with ≥2 diagrams
and ≥1 code file (checks that no button is visible while rapid diffs greys out
the previous file); `--click` once per UI on an MR whose first file is a diagram (the differ
opens, the file block does not collapse). In all-files mode also run
`--scroll` and `--scroll --legacy` on the many-files MR: the legacy UI mounts
only the blocks near the viewport, so without scrolling most files go unchecked.

**Branch view:** `node test/e2e/live/branch-button.mjs main <path> --shots $S`
for one `.bpmn` and one `.dmn`.

| The runner asserts | You check in the screenshots |
|---|---|
| one button per diagram block, none elsewhere, path = block path | icon and label legible, accent visible |
| label by file type | button right before ⋮, same spot on every file |
| no churn while idle; none visible during the grey-out | header wraps no worse than GitLab's own layout |
| differ tab opens; block not collapsed; split menu opens/closes | branch button beside Blame, not glued to it; menu readable |

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
