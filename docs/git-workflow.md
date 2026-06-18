# Git and GitLab workflow

Read before any git operations (branches, commits, push, MR, rebase).

Our GitLab: **https://gitlab.example.com**. The CLI for working with MRs is `glab`.

## Branches

- The main branch is **master**, it is protected. **NEVER commit or push to master directly.**
- Each task is done in a separate branch of the form `feature/<description>` or `fix/<description>`, created from a fresh `origin/master` (before creating — `git fetch origin`).
- Claude Code sessions are launched by a human in separate git worktrees — one per task. Work only in your current working directory and your branch; do not create worktrees yourself and do not switch branches in other directories.
- Do not delete others' branches, do not change the repository settings.

## Commits

- Messages are minimalist, to the point; without `Co-Authored-By` and without mentions of the author/tools.
- Small, incremental, reviewable changes; do not mix refactoring with features/fixes.

## Before push

- Run the tests locally: `npm test`. **Do not push with failing tests.**
- If master has moved ahead — `git rebase origin/master`, resolve conflicts, run the tests again.
- No `git push --force` to shared branches; in your own feature branch after a rebase — only `--force-with-lease`.

## Merge Request

- **Completing any task = MR.** Once the changes are ready (tests green) push the branch and create an MR into master via `glab mr create`. This is the default behavior — **do not ask whether to commit to master / whether an MR is needed**, master is always via MR.
- **Always** pass `--remove-source-branch` to `glab mr create` — so that the "delete source branch on merge" checkbox is set in all MRs (without the flag the project's floating default is used). After the merge the branch is deleted automatically, no separate cleanup is needed. Prefer the `/mr` command, which wraps `glab mr create --remove-source-branch` so the flag can't be forgotten (it still slips on the bare `--fill --yes` form otherwise).
- If work was accidentally started on `master` — create a feature/fix branch and move the changes there before committing; do not raise this as a question, just do it and report briefly.
- **Do not ask permission** to push your own feature branch and open an MR — when ready (tests green) push and create the MR automatically, then briefly report the result (the link to the MR). This applies only to your own branch and MR; master still must not be pushed to, the merge — only the human.
- The MR merge is performed only by the human after review. **Do not merge the MR yourself, do not use auto-merge.**

## Finishing the task / cleanup

After the human has reviewed the MR and **merged** it, on the `/merged` command (or a phrase like "tidy up" / "finish the task" / "clean up") perform the local cleanup:

1. `git checkout master`
2. `git pull` (pull the fresh master with the already merged MR)
3. `git branch -d <feature-branch>` (delete the local feature branch; `-d`, not `-D` — if the branch is not merged, stop and report)

The remote branch is usually removed by GitLab on merge; if it remains — `git push origin --delete <branch>`. Do not do the cleanup until the MR is merged.

## CI

- There is no CI pipeline (`.gitlab-ci.yml`) in the project yet — this is groundwork for the future. The plan is for the pipeline to run the tests on MRs and master, and that an MR cannot be merged with a red pipeline. When the pipeline appears — update this file.
- While there is no pipeline — a local test run before push is mandatory.

## Parallel work

- Several Claude Code sessions may work on the project simultaneously in different worktrees.
- Do not touch files outside the scope of your task, especially shared configs and lock files (`manifest.json`, `package.json`, `package-lock.json`, `.claude/`, `CLAUDE.md`, `docs/`) — except when changing them is the task itself. This minimizes merge conflicts.
