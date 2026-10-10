# GitHub

Part of the `live-check` skill catalog; the prerequisites and rules are in its `SKILL.md`.

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
