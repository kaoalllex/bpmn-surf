# Git workflow

Read before any git operations (branches, commits, push, PR, rebase).

## Remote: public GitHub

The repository is published at **https://github.com/kaoalllex/bpmn-surf**. `gh` is
installed and authenticated on the development machine. (GitLab still matters as the
platform the extension *works on*; that is unrelated to where these sources live.)

The normal flow applies:

- branch off a fresh `master` (`git fetch origin` first);
- commit locally, in small reviewable steps;
- push the branch and open a **pull request** into master — once the human says "ok";
- the verification thresholds of CLAUDE.md (`npm test` + affected e2e before "done", the full e2e before push, CI after push) stay mandatory;
- `master` stays protected: never commit into it directly — everything lands through a PR.

The `/pr` and `/cleanup` commands wrap this flow: `/pr` pushes the branch and opens the
pull request, `/cleanup` syncs master and deletes the merged local branch (and its worktree, if any) afterwards.

## Branches

- The main branch is **master**, it is protected. **NEVER commit or push to master directly.** In Claude Code sessions a PreToolUse hook (`.claude/hooks/guard-master.js`, wired in `.claude/settings.json`, tested by `test/harness/guard-master.test.js`) blocks `git commit` while on master and `git push` while on master or to master.
- Each task is done in a separate branch of the form `feature/<description>` or `fix/<description>`, created from a fresh `origin/master` (`git fetch origin` first).
- By default a task is done in the **main checkout**, on a new branch from a fresh `origin/master`. A worktree is used only when the human runs parallel sessions (see "Parallel work"); a worktree has no codegraph index. Work only in your current working directory and your branch; do not create worktrees yourself and do not switch branches in other directories.
- Do not delete others' branches, do not change the repository settings.

## Commits

- Messages are minimalist, to the point; without `Co-Authored-By` and without mentions of the author/tools.
- Small, incremental, reviewable changes; do not mix refactoring with features/fixes.

## Before push

- Run the tests locally: `npm test && npm run test:e2e`. **Do not push with failing tests**, and do not report a task as done with failing tests.
- If master has moved ahead — `git rebase origin/master`, resolve conflicts, run the tests again.
- No `git push --force` to shared branches; in your own feature branch after a rebase — only `--force-with-lease`.

## Pull Request

- **Completing any task = PR.** Once the changes are ready (tests green) and the human has said "ok", push the branch and open a pull request into master (`gh pr create`). **Do not ask whether to commit to master / whether a PR is needed** — master is always via PR.
- If work was accidentally started on `master` — create a feature/fix branch and move the changes there before committing; do not raise this as a question, just do it and report briefly.
- **Push and open the PR only after the human's explicit "ok"** — the human usually checks the change by hand first. Running `/pr` is that "ok". Then report the PR link and wait for CI: `gh pr checks <n> --watch`; report pass/fail. A red run is investigated; if master itself is red (`gh run list -b master -L 1`), say so. Master still must not be pushed to, the merge — only the human.
- When pushing follow-up changes to an already-open PR (review fixes, additions), add them as **a new commit** — do not `git commit --amend` and do not force-push the rebased/rewritten branch. A plain `git push` of an extra commit keeps the review history readable and avoids force-pushing.
- The PR merge is performed only by the human after review. **Do not merge the PR yourself, do not use auto-merge.**

## Finishing the task / cleanup

After the human has reviewed the PR and **merged** it, on a "tidy up" / "finish the task" / "clean up" request perform the local cleanup:

1. Confirm the PR is merged: `gh pr list --head <feature-branch> --state merged --json number` is not empty. If it is empty — stop and report.
2. Leave the feature branch: in the main checkout `git checkout master`; in a linked worktree (`git rev-parse --git-dir` ≠ `--git-common-dir`) run the rest from the main checkout with `git -C <main>`.
3. `git pull` (pull the fresh master with the already merged PR) and `git fetch --prune`.
4. If the work was in a worktree: `git -C <main> worktree remove <path>` — only when it is clean; otherwise stop and report.
5. `git branch -D <feature-branch>`. GitHub merges PRs by squash, so the branch is never an ancestor of master and `-d` always refuses; step 1 is the merge check.

The remote branch is removed by GitHub on merge when the repository has "automatically delete head branches" enabled; if it remains, the human deletes it. Do not do the cleanup until the PR is merged.

## Releases

Distribution is via **releases** (a git tag + an attached zip asset), not via archives committed into the repo (binaries would bloat the git history forever). The releases page is the user-facing download list — it lists every version automatically, so there is nothing to prune.

1. Bump the version on a branch via `/release` (`manifest.json` + a `CHANGELOG.md` entry) and merge it — see the `release` skill.
2. On a fresh `master`, build the distribution zip with `npm run package` (`scripts/package.sh` reads the version from `manifest.json`), then create the `vX.Y.Z` release with `gh release create`, that zip attached and notes taken from the matching `CHANGELOG.md` section.
3. For the Chrome Web Store, build the upload with `npm run package -- --store` → `dist/bpmn-surf-<version>-store.zip`. Same file set, but `manifest.json` sits at the zip root (the store requires it), while the release zip wraps everything in a `bpmn-surf/` folder that unpacks ready for "Load unpacked". A store build is always public and refuses extra hosts. Both zips can sit in `dist/` together — a build replaces only its own zip.

Since [FEAT-0033] a self-hosted host is added from the extension popup, so a preconfigured build is no longer needed to reach an internal instance — the argument below only saves the user that one step.

A build for an internal GitLab instance takes the host as an argument — `npm run package -- gitlab.internal.example` — which adds `https://<host>/*` to `host_permissions` **in the staged copy only**; the tracked `manifest.json` declares no site at all (every site is on or off in the popup), so internal domains never enter the repository.

## CI

- `.github/workflows/test.yml` runs the unit and Layer-2 e2e tests on every PR into master and on every push to master (details — `docs/testing.md`, the "CI" section). It does not build or package anything.
- **A PR is merged only with a green CI run.** A red run is investigated and fixed, not re-run until it passes.
- CI does not replace the local run: `npm test && npm run test:e2e` before push stays mandatory.

## Parallel work

- Several Claude Code sessions may work on the project simultaneously in different worktrees — only when the human launches them that way.
- A new task file created in a worktree may collide with a number taken in a parallel session: before the PR re-check it against `git ls-tree -r --name-only origin/master docs/issues` and open PRs (`gh pr list --search <CODE>`).
- To start a new parallel task, a human creates the worktree **before** launching the session: `npm run worktree -- <task-slug> [feature|fix]` (wraps `scripts/new-worktree.sh`). It fetches `origin`, creates `../bpmn-diff-<task-slug>` on a new branch from `origin/master`, runs `npm install` there, and prints the `cd … && claude` command to run. Claude itself does not create worktrees (see above).
- Do not touch files outside the scope of your task, especially shared configs and lock files (`manifest.json`, `package.json`, `package-lock.json`, `.claude/`, `CLAUDE.md`, `docs/`) — except when changing them is the task itself. This minimizes merge conflicts.
