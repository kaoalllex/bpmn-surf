# Git workflow

Read before any git operations (branches, commits, push, PR, rebase).

## Remote: public GitHub

The repository is published at **https://github.com/kaoalllex/bpmn-surf**. `gh` is
installed and authenticated on the development machine. (GitLab still matters as the
platform the extension *works on*; that is unrelated to where these sources live.)

The normal flow applies:

- branch off a fresh `master` (`git fetch origin` first);
- commit locally, in small reviewable steps;
- push the branch and open a **pull request** into master;
- `npm test` before declaring a task finished stays mandatory;
- `master` stays protected: never commit into it directly — everything lands through a PR.

The `/pr` and `/cleanup` commands wrap this flow: `/pr` pushes the branch and opens the
pull request, `/cleanup` syncs master and deletes the merged local branch afterwards.

## Branches

- The main branch is **master**, it is protected. **NEVER commit or push to master directly.**
- Each task is done in a separate branch of the form `feature/<description>` or `fix/<description>`, created from a fresh `origin/master` (`git fetch origin` first).
- Claude Code sessions are launched by a human in separate git worktrees — one per task. Work only in your current working directory and your branch; do not create worktrees yourself and do not switch branches in other directories.
- Do not delete others' branches, do not change the repository settings.

## Commits

- Messages are minimalist, to the point; without `Co-Authored-By` and without mentions of the author/tools.
- Small, incremental, reviewable changes; do not mix refactoring with features/fixes.

## Before push

- Run the tests locally: `npm test`. **Do not push with failing tests**, and do not report a task as done with failing tests.
- If master has moved ahead — `git rebase origin/master`, resolve conflicts, run the tests again.
- No `git push --force` to shared branches; in your own feature branch after a rebase — only `--force-with-lease`.

## Pull Request

- **Completing any task = PR.** Once the changes are ready (tests green) push the branch and open a pull request into master (`gh pr create`). This is the default behavior — **do not ask whether to commit to master / whether a PR is needed**, master is always via PR.
- If work was accidentally started on `master` — create a feature/fix branch and move the changes there before committing; do not raise this as a question, just do it and report briefly.
- **Do not ask permission** to push your own feature branch and open a PR — when ready (tests green) push and open it automatically, then briefly report the result (the link to the PR). This applies only to your own branch and PR; master still must not be pushed to, the merge — only the human.
- When pushing follow-up changes to an already-open PR (review fixes, additions), add them as **a new commit** — do not `git commit --amend` and do not force-push the rebased/rewritten branch. A plain `git push` of an extra commit keeps the review history readable and avoids force-pushing.
- The PR merge is performed only by the human after review. **Do not merge the PR yourself, do not use auto-merge.**

## Finishing the task / cleanup

After the human has reviewed the PR and **merged** it, on a "tidy up" / "finish the task" / "clean up" request perform the local cleanup:

1. `git checkout master`
2. `git pull` (pull the fresh master with the already merged PR)
3. `git branch -d <feature-branch>` (delete the local feature branch; `-d`, not `-D` — if the branch is not merged, stop and report)

The remote branch is removed by GitHub on merge when the repository has "automatically delete head branches" enabled; if it remains, the human deletes it. Do not do the cleanup until the PR is merged.

## Releases

Distribution is via **releases** (a git tag + an attached zip asset), not via archives committed into the repo (binaries would bloat the git history forever). The releases page is the user-facing download list — it lists every version automatically, so there is nothing to prune.

1. Bump the version on a branch via `/release` (`manifest.json` + `version.json` + a `CHANGELOG.md` entry) and merge it — see the `release` skill.
2. On a fresh `master`, build the distribution zip with `npm run package` (`scripts/package.sh` reads the version from `manifest.json`), then create the `vX.Y.Z` release with `gh release create`, that zip attached and notes taken from the matching `CHANGELOG.md` section.

The automated update notifier (FEAT-0012) reads the `UPDATE_*` URLs in `src/core/config.js`, which point at the published repository — so a new `version.json` on `master` is what makes the notifier offer the update.

## CI

- There is no CI pipeline (GitHub Actions workflow) in the project yet — this is groundwork for the future. The plan is for the pipeline to run the tests on PRs and master, and that a PR cannot be merged with a red pipeline. When the pipeline appears — update this file.
- While there is no pipeline — a local test run before push is mandatory.

## Parallel work

- Several Claude Code sessions may work on the project simultaneously in different worktrees.
- To start a new parallel task, a human creates the worktree **before** launching the session: `npm run worktree -- <task-slug> [feature|fix]` (wraps `scripts/new-worktree.sh`). It fetches `origin`, creates `../bpmn-diff-<task-slug>` on a new branch from `origin/master`, runs `npm install` there, and prints the `cd … && claude` command to run. Claude itself does not create worktrees (see above).
- Do not touch files outside the scope of your task, especially shared configs and lock files (`manifest.json`, `package.json`, `package-lock.json`, `.claude/`, `CLAUDE.md`, `docs/`) — except when changing them is the task itself. This minimizes merge conflicts.
