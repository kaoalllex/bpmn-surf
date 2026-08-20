# Git workflow

Read before any git operations (branches, commits, push, MR, rebase).

## Current mode: local-only, no reachable remote

**We do not work with GitLab any more.** `gitlab.example.com` is unreachable from the
development machine (DNS does not resolve), so `git fetch` / `git push origin`, `glab` and
`npm run release:gitlab` fail instantly. The `origin` remote still points at the old GitLab
URL and is dead — do not try to reach it, and do not report the failure as a problem to fix.

The plan is to publish the repository on **public GitHub** ([INFRA-0007]; `gh` is already
installed and authenticated on the machine). Until that move happens:

- branch off the **local** `master` — no `git fetch origin` first, it will fail;
- commit locally, in small reviewable steps, as before;
- **do not** push, do not open an MR/PR, do not run `/mr`, `/cleanup` or `npm run release:gitlab`;
- `npm test` before declaring a task finished stays mandatory — it is fully local;
- `master` stays protected by convention: never commit into it, even locally.

So completing a task now means: green tests, commits on a local feature branch, and a short
report. The branch stays around until there is a remote to push it to.

The GitLab-specific sections below are kept as the record of the pre-move flow and as the
checklist of what has to be re-created on GitHub — most of it (branch → review → merge into
master) carries over with MR renamed to PR. **They are inactive today.**

## glab setup (inactive — no GitLab access)

Install on macOS and authenticate against our GitLab:

```bash
brew install glab
glab auth login --hostname gitlab.example.com
```

For authorization you need an access token with `api`, `read_repository`, `write_repository` rights.

## Branches

- The main branch is **master**, it is protected. **NEVER commit or push to master directly.**
- Each task is done in a separate branch of the form `feature/<description>` or `fix/<description>`, created from the **local** `master` (`git fetch origin` is not possible — see "Current mode" above; when the remote comes back, branch from a fresh `origin/master` again).
- Claude Code sessions are launched by a human in separate git worktrees — one per task. Work only in your current working directory and your branch; do not create worktrees yourself and do not switch branches in other directories.
- Do not delete others' branches, do not change the repository settings.

## Commits

- Messages are minimalist, to the point; without `Co-Authored-By` and without mentions of the author/tools.
- Small, incremental, reviewable changes; do not mix refactoring with features/fixes.

## Before push

Pushing is impossible today; the test rule below applies to finishing a task instead.

- Run the tests locally: `npm test`. **Do not push with failing tests**, and do not report a task as done with failing tests.
- If master has moved ahead — `git rebase origin/master`, resolve conflicts, run the tests again.
- No `git push --force` to shared branches; in your own feature branch after a rebase — only `--force-with-lease`.

## Merge Request (inactive — no remote; the GitHub equivalent is a PR, [INFRA-0007])

- **Completing any task = MR.** Once the changes are ready (tests green) push the branch and create an MR into master via `glab mr create`. This is the default behavior — **do not ask whether to commit to master / whether an MR is needed**, master is always via MR.
- **Always** pass `--remove-source-branch` to `glab mr create` — so that the "delete source branch on merge" checkbox is set in all MRs (without the flag the project's floating default is used). After the merge the branch is deleted automatically, no separate cleanup is needed. Prefer the `/mr` command, which wraps `glab mr create --remove-source-branch` so the flag can't be forgotten (it still slips on the bare `--fill --yes` form otherwise).
- If work was accidentally started on `master` — create a feature/fix branch and move the changes there before committing; do not raise this as a question, just do it and report briefly.
- **Do not ask permission** to push your own feature branch and open an MR — when ready (tests green) push and create the MR automatically, then briefly report the result (the link to the MR). This applies only to your own branch and MR; master still must not be pushed to, the merge — only the human.
- When pushing follow-up changes to an already-open MR (review fixes, additions), add them as **a new commit** — do not `git commit --amend` and do not force-push the rebased/rewritten branch. A plain `git push` of an extra commit keeps the review history readable and avoids force-pushing.
- The MR merge is performed only by the human after review. **Do not merge the MR yourself, do not use auto-merge.**

## Finishing the task / cleanup (inactive — `/cleanup` needs `git pull`)

After the human has reviewed the MR and **merged** it, on the `/cleanup` command (or a phrase like "tidy up" / "finish the task" / "clean up") perform the local cleanup:

1. `git checkout master`
2. `git pull` (pull the fresh master with the already merged MR)
3. `git branch -d <feature-branch>` (delete the local feature branch; `-d`, not `-D` — if the branch is not merged, stop and report)

The remote branch is usually removed by GitLab on merge; if it remains — `git push origin --delete <branch>`. Do not do the cleanup until the MR is merged.

## Releases (inactive — moves to GitHub Releases, [INFRA-0007])

Distribution is via **GitLab Releases** (a git tag + an attached zip asset), not via archives committed into the repo (binaries would bloat the git history forever). The Releases page (`/-/releases`) is the user-facing download list — it lists every version automatically, so there is nothing to prune.

1. Bump the version on a branch via `/release` (`manifest.json` + `version.json` + a `CHANGELOG.md` entry) and merge the MR — see the `release` skill.
2. After the MR is merged, on a fresh `master`, publish the release:

   ```bash
   git checkout master && git pull
   npm run release:gitlab        # → scripts/release-gitlab.sh
   ```

   `release-gitlab.sh` reads the version from `manifest.json`, builds the zip via `package.sh`, then creates the `vX.Y.Z` release with the zip attached as a download asset and notes taken from the matching `CHANGELOG.md` section. The git tag is created server-side from `--ref` (default `master`) via the API — no tag push into protected `master` is needed. Pass a ref to tag a different commit: `npm run release:gitlab -- <sha|branch|tag>`.

   Requires `glab` authenticated against the project's GitLab (`glab auth status`). The script aborts if `vX.Y.Z` already exists — bump the version first.

The automated update notifier (FEAT-0012) stays inactive until the `UPDATE_*` URLs in `src/core/config.js` are set (area B / [INFRA-0007]); pointing `UPDATE_HOME_URL` at the Releases page is a cheap later step.

## CI

- There is no CI pipeline (`.gitlab-ci.yml`) in the project yet — this is groundwork for the future. The plan is for the pipeline to run the tests on MRs and master, and that an MR cannot be merged with a red pipeline. When the pipeline appears — update this file.
- While there is no pipeline — a local test run before push is mandatory.

## Parallel work

- Several Claude Code sessions may work on the project simultaneously in different worktrees.
- To start a new parallel task, a human creates the worktree **before** launching the session: `npm run worktree -- <task-slug> [feature|fix]` (wraps `scripts/new-worktree.sh`). ⚠️ It starts with a fetch of the dead `origin`, so today it fails — create the worktree by hand from the local `master` until the GitHub move. It fetches `origin`, creates `../bpmn-diff-<task-slug>` on a new branch from `origin/master`, runs `npm install` there, and prints the `cd … && claude` command to run. Claude itself does not create worktrees (see above).
- Do not touch files outside the scope of your task, especially shared configs and lock files (`manifest.json`, `package.json`, `package-lock.json`, `.claude/`, `CLAUDE.md`, `docs/`) — except when changing them is the task itself. This minimizes merge conflicts.
