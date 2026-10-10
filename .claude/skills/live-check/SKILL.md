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
| `src/content/` — buttons, file detection, placement, SPA navigation | the catalog below (GitLab); `src/content/providers/github/`, `src/differ/platform/github-platform-client.js`, `src/core/github-changes-payload.js` — "GitHub" below |
| the differ (`src/differ/`) | the Layer-2 spec of that area (`differ-edit-*`, `differ-prop-group-*`, `differ-highlight-*`, `dmn-*`…): add a case that fails without the fix. For a diagram from a report, pull it first (`gitlab-test-project` skill, "From report to repro") |
| `src/differ/navigation/`, `src/differ/platform/` — dive-in, callers, badges, code search | Layer-2 spec of that area **and** "Differ navigation" below (the search is mocked offline) |
| how differ tabs open — `openDiffer` (`src/core/utils.js`), `src/differ/shared/differ-tab-navigator.js` | `mr-button --click`, `branch-button`, and "Differ navigation" below |
| `src/popup/`, `src/background/`, `src/hosts/` | `node test/e2e/live/popup-screens.mjs <scratchpad>` (offline) and the screenshots; the site-warning scenario under "GitHub" |
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
6. GitHub, all of "GitHub" below.
6a. Camunda 8, all of "Camunda 8" below, on GitLab and on GitHub.
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

### Search fallback link

Every navigation locator that gives up (dive-in, callers, handler badges,
correlation) opens GitLab's code search. The URL format is pinned by unit tests;
only a live run shows GitLab still answers it ([BUG-0038]: it once 404'd).

```bash
node test/e2e/live/search-page.mjs --shots <scratchpad>/live
```

| The runner asserts | You check in the screenshots |
|---|---|
| 200 at a slash branch, the default branch and no ref; the sample file found only at its branch | a code-results page of the sandbox, not a sign-in or error page |

Run it with the signed-in profile. GitLab used to redirect a signed-out search to
sign-in. On 2026-10-03 a signed-out search scoped to the public demo project returned
code results, but the code search *API* still answered 401.

### Differ navigation (signed in)

Dive-in, the callers list, the decision badge, handler and correlation badges use
GitLab code search, which answers only a signed-in session — so a change to
navigation or to the platform client's search gets a live run on top of Layer-2.
The demo tours cover all of it; walk them without recording, into the scratchpad:

```bash
T=$(cat ~/.config/bpmn-surf-demo-token)   # resolve the showcase MR by title
BPMN_SURF_PROJECT=https://gitlab.com/kao.alllex/bpmn-surf-demo \
  node test/e2e/live/record-demo.mjs <iid> <scratchpad>/demo --no-video
```

| The runner asserts | You check in the screenshots |
|---|---|
| every tour reaches its tabs (`<clip>: OK`); a broken one leaves `failed-<clip>-<n>.png` | `3-callers.png` lists both callers; BPMN icons render; DMN cells coloured |

This is a check, not a re-recording: the README and store media change only on
the human's request (`gitlab-test-project`, "The demo project").

### GitHub

The harness loads a staged copy of the extension with gitlab.com and github.com baked
in (`docs/testing.md`), so these run without the popup. There is no GitHub script yet:
drive them with `launchWithExtension()` from `test/e2e/live/support.mjs` or by hand, once
signed in (`capture-login.mjs --github`, the Google-SSO route in
`test/e2e/live/README.md`) and once anonymous (`BPMN_SURF_ANONYMOUS=1`), with the
Network filter on `api.github.com` (the search and raw requests go to github.com itself). Sandbox: `github.com/kaoalllex/bpmn-surf-test` and
`bpmn-surf-test-private`; the numbers below are those of 2026-10-09 — list the PRs and
pick by kind if one moved.

| Scenario | Expect |
|---|---|
| sandbox `#9` `/changes` signed in, `/files` anonymous | one `Schema diff` / `Decision diff` button per diagram file, none elsewhere; signed in: **zero** `api.github.com` requests while opening the page, clicking a button and the differ's handler badges; anonymous: one `pulls/{n}/files` per differ |
| `#9` after `main` moved | the target side equals GitHub's own diff (merge base, not the base tip) |
| `#16` Conversation → Files changed (soft navigation) | the button appears and resolves the right PR (no stale payload) |
| `bpmn-io/dmn-js#852` (101 files, 6 `.dmn`), scroll | buttons follow the blocks, no blinking, none on code files; signed in: the page embeds no file diffs, so the merge base comes from one `page_data/diff_entries` request — still zero `api.github.com` |
| sandbox `#4` (DMN), `camunda/camunda-bpm-examples#104` | the differ renders under GitHub's CSP, no `EvalError` in the console |
| renames: sandbox `#7`, `camunda/camunda-modeler#6197` | both sides open |
| `#16` (spaces and `#` in the path) | the file opens, both sides load |
| merged `#2`, closed `#10` | the buttons and the diff work |
| fork PR `camunda/camunda-bpm-examples#260` (no diagrams) | no buttons, no errors from us; a fork PR with a diagram is still to be found |
| private `bpmn-surf-test-private#1` | signed in: buttons, differ and handler badges, no API request; anonymous: GitHub's own 404, nothing of ours |
| a changed handler's badge | links to that file's diff in the PR (`#diff-<sha256>`) |
| dive-in to a called process / decision on the default branch, an unchanged handler (signed in) | opens the file found through github.com's web search (`/search?…&type=code`, JSON), never GitLab's tree walk; no `api.github.com` request |
| a handler added in the PR (not on the default branch) | found through the PR's own files read at the head, opens its raw file |
| callers list | the files that call the diagram, default branch plus the PR's files |
| dive-in miss, or anonymous / right after a burst of searches (429) | falls back to github.com code search (`searchPageUrl`); anonymous still finds what the PR's files contain |
| commit and range views, signed in: `/pull/N/changes/<sha>`, `/changes/<a>..<b>`, and the picker switching between them by click | the button shows exactly the selection (labels `<headline> (<shortSha>)`, the base branch name for the PR base); after a picker switch the button is not stale |
| classic anonymous: `/pull/N/commits/<sha>`, `/files/<a>..<b>` | the button diffs exactly the shown pair, with short-SHA labels; a REST-fallback page refuses a selection (no button) |
| a raw `.bpmn` page or a JSON page on GitLab, and GitLab's own 404 page (e.g. a missing MR) on a self-hosted GitLab without a type set | no `!` on the icon, nothing of ours |
| popup, a self-hosted site: the type select (Auto / GitLab / GitHub) set by hand | the choice survives a reload and an export/import; an unrecognised site shows the hint and the Home warning, and `!` until a type is picked |
| blob page of a `.bpmn` / `.dmn` | `View schema` / `View decision` split button before Raw; the local-file menu diffs against a file; follows soft navigation between files |
| popup: remove a site, remove them all, update from 1.3 | the site goes and the tab stops decorating after reload; no site: `!` on the icon and the warnings on Home and Sites; an update that lost gitlab.com: the "Turn on gitlab.com" notice |
| non-PR GitHub pages (Conversation, Commits, issues, repo root) | nothing injected, no console errors from us |
| `npm run package -- --store` | the manifest has neither `content_scripts` nor `host_permissions` |

Open each differ and screenshot the buttons into the scratchpad; the runner-free scenarios
above are judged by you, so say which you ran and which you skipped.

### Camunda 8 (FEAT-0038)

Material: the sandboxes' `order-service-c8/` module and its three MR / PR pairs
(`c8/model-changes`, `c8/worker-code`, `c8/migrate-payment` — resolve the numbers by
branch, see `docs/testing.md`). Signed in on both platforms; drive by hand or with
`launchWithExtension()`, screenshots into the scratchpad.

| Scenario | Expect |
|---|---|
| `c8/model-changes`, every changed diagram | the Zeebe panel (groups "Task definition", "Input mapping"…), a painted group for each change kind, the FEEL condition of `Flow_yes` split into lines, "Prepare the documents" outlined; edit mode on `OrderMain.bpmn`: the panel edits, the download keeps `xmlns:zeebe` |
| `c8/migrate-payment` | opens with no errors, both sides highlighted; the Zeebe panel on the C8 side |
| `main` of the C8 module: OrderMain → Payment → `PaymentC8`, AssessRisk → `PaymentRiskC8.dmn` | dive-in opens the right file |
| dive-out from Delivery, from `PaymentRiskC8.dmn` | the callers list holds Fulfillment / Payment; the caller opens with its call site selected |
| Payment → Dunning (`DunningC8`, defined nowhere) | the code-search page |
| badges on the C8 module | on every task with a worker — incl. `screenFraud` / `packItem` (method name), `reserve-stock` (type not first), `find-items-in-catalog` (multi-line) and the Java ones; `find-items` and `charge-customer` open their own workers; `archive-delivery` opens the code-search page; the HTTP connector has none; `escalate-delivery` opens its worker even without `ZeebeWorker` configured (no annotated hit → the unannotated one, as for C7) |
| `c8/worker-code` | worker code only, no diagram, so no differ opens from it: check that `HandlerLocator.extractHandlerKeys` on its two files at the MR head yields `topic:find-items` / `topic:charge-customer` (the "changed" badge is Layer 2) |
| a C7 topic equal to a C8 method name (`findItems` vs `fun findItems` under `type = "find-items"`) | the C7 badge opens the C7 handler, not the C8 worker |
| any C7 MR of the sandbox | exactly as before: the Camunda 7 panel, C7 badges and dive-in on `order-service/` |

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
