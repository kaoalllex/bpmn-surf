# GitHub

Part of the `live-check` skill catalog; the prerequisites and rules are in its `SKILL.md`.

The harness loads a staged copy of the extension with gitlab.com and github.com baked
in (`docs/testing.md`), so these run without the popup. The badge rows of a blob view run
with `badges.mjs` (`BPMN_SURF_PROJECT=https://github.com/kaoalllex/bpmn-surf-test`, see
`camunda8.md`); drive the rest with `launchWithExtension()` from `test/e2e/live/support.mjs` or by hand, once
signed in (`capture-login.mjs --github`, the Google-SSO route in
`test/e2e/live/README.md`) and once anonymous (`BPMN_SURF_ANONYMOUS=1`), with the
Network filter on `api.github.com` (the search and raw requests go to github.com itself). Sandbox: `github.com/kaoalllex/bpmn-surf-test` and
`bpmn-surf-test-private`; the numbers below are those of 2026-10-09 — list the PRs and
pick by kind if one moved.

| Scenario | Expect |
|---|---|
| _(smoke)_ sandbox `#9` `/changes` signed in, `/files` anonymous | one `Schema diff` / `Decision diff` button per diagram file, none elsewhere; signed in: **zero** `api.github.com` requests while opening the page, clicking a button and the differ's handler badges; anonymous: one `pulls/{n}/files` per differ |
| `#9` after `main` moved | the target side equals GitHub's own diff (merge base, not the base tip) |
| _(smoke)_ a diagram PR's Files changed, window ~1100–1200 px wide with the file tree open (`setViewportSize` on a `launchWithExtension()` page) | the label stays on one line: the button is as tall as GitHub's own (28 px, not 48), its right edge inside the file header |
| _(smoke)_ `#16` Conversation → Files changed (soft navigation) | the button appears and resolves the right PR (no stale payload) |
| _(smoke)_ `bpmn-io/dmn-js#852` (101 files, 6 `.dmn`), scroll | buttons follow the blocks, no blinking, none on code files; signed in: the page embeds no file diffs, so the merge base comes from one `page_data/diff_entries` request — still zero `api.github.com` |
| sandbox `#4` (DMN), `camunda/camunda-bpm-examples#104` | the differ renders under GitHub's CSP, no `EvalError` in the console |
| renames: sandbox `#7` _(smoke)_, `camunda/camunda-modeler#6197` | both sides open |
| _(smoke)_ `#16` (spaces and `#` in the path) | the file opens, both sides load |
| _(smoke)_ merged `#2`, closed `#10` | the buttons work; `#2`'s diff works; both sides of `#10` are truncated on purpose, so its differ says the file is not a valid diagram (BUG-0051) |
| fork PR `camunda/camunda-bpm-examples#260` (one `.bpmn`, head fork deleted: GitHub itself fails to render the file diffs) | no buttons, no errors from us (the failing requests are GitHub's own); a fork PR with a renderable diagram is still to be found |
| private `bpmn-surf-test-private#1` | signed in: buttons, differ and handler badges, no API request; anonymous: GitHub's own 404, nothing of ours |
| a changed handler's badge | links to that file's diff in the PR (`#diff-<sha256>`) |
| dive-in to a called process / decision on the default branch, an unchanged handler (signed in) | opens the file found through github.com's web search (`/search?…&type=code`, JSON), never GitLab's tree walk; no `api.github.com` request |
| a handler added in the PR (not on the default branch): sandbox `#5`, `#1`, `#17` | found through the PR's own files read at the head; the badge is `added`, titled "Handler added in this PR — open its diff", and sends the PR tab to that file's `#diff-<sha256>` |
| callers list | the files that call the diagram, default branch plus the PR's files; anonymous: the PR's own callers, or "Couldn't check the calling diagrams." with a repository-search link — never "No diagram calls this one" |
| dive-in miss, or anonymous / right after a burst of searches (429) | falls back to github.com code search (`searchPageUrl`); anonymous still finds what the PR's files contain |
| _(smoke, but the picker)_ commit and range views, signed in: `/pull/N/changes/<sha>`, `/changes/<a>..<b>`, and the picker switching between them by click | the button shows exactly the selection (labels `<headline> (<shortSha>)`, the base branch name for the PR base); after a picker switch the button is not stale |
| _(smoke)_ classic anonymous: `/pull/N/commits/<sha>`, `/files/<a>..<b>` | the button diffs exactly the shown pair, with short-SHA labels; a REST-fallback page refuses a selection (no button) |
| a raw `.bpmn` page or a JSON page on GitLab, and GitLab's own 404 page (e.g. a missing MR) on a self-hosted GitLab without a type set | no `!` on the icon, nothing of ours |
| a self-hosted site added without a type, on its real pages | `!` on the icon until a type is picked; after picking one and reloading, the buttons appear (the popup itself — the select surviving a reload and an export/import, the hint, the Home warning — is Layer 2: `popup-sites.spec.js`, `popup-settings.spec.js`) |
| blob page of a `.bpmn` / `.dmn` | `View schema` / `View decision` split button before Raw; the local-file menu diffs against a file; follows soft navigation between files |
| remove a site in the popup, then reload its tab | the tab stops decorating; with no site left, `!` on the icon (the popup's own screens — the warnings, the "Turn on gitlab.com" notice after an update from 1.3 — are Layer 2: `popup-sites.spec.js`) |
| non-PR GitHub pages (Conversation, Commits, issues, repo root) | nothing injected, no console errors from us |

Rows marked _(smoke)_ run in `smoke.mjs`'s GitHub cells, which are `pr-button.mjs` runs
(`node test/e2e/live/pr-button.mjs <number> [--range …] [--soft] [--width …] [--scroll] [--click]`,
signed in and with `BPMN_SURF_ANONYMOUS=1`): the buttons per block, their height and
place, no churn, the differ's head side, and the `api.github.com/repos/…` count. Of the
"commit and range" row, switching in the picker by click stays by hand.

Open each differ and screenshot the buttons into the scratchpad; the runner-free scenarios
above are judged by you, so say which you ran and which you skipped.
