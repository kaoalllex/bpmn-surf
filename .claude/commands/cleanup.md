---
description: After the human merged the PR — sync master, delete the merged local feature branch and its worktree
allowed-tools: Read, Bash(git *), Bash(gh *)
---

The human has just merged the PR. Do the local cleanup from `docs/git-workflow.md` ("Finishing the task / cleanup"). This is the explicit cleanup command — it is the only trigger that authorizes deleting the branch and the worktree.

Steps:

1. Determine the feature branch to clean up:
   - If the current branch is **not** `master`, that is the branch.
   - If already on `master`, list the local branches whose PR is merged (`gh pr list --state merged --head <branch>` per branch of `git branch`). If several, or none is obvious, **list them and ask** which to delete — never guess.
2. **Safety check** — `gh pr list --head <branch> --state merged --json number` must not be empty. If it is, **stop and report**: the PR may not be merged yet.
3. Find where to run from: if `git rev-parse --git-dir` ≠ `git rev-parse --git-common-dir`, this is a linked worktree; the main checkout is the parent of `--git-common-dir`. Run every following command against the main checkout (`git -C <main> …`).
4. Sync master in the main checkout: `checkout master` → `pull` → `fetch --prune`.
5. Worktree only: `git -C <main> worktree remove <worktree-path>`. If it refuses (uncommitted changes), **stop and report** — do not force. Chain it with step 6 in one command, and `cd <main>` afterwards: the session's working directory is gone.
6. `git -C <main> branch -D <branch>`. GitHub merges by squash, so `-d` always refuses; step 2 is the merge check.
7. **Do NOT touch the remote branch.** GitHub deletes the head branch on merge when "Automatically delete head branches" is enabled; otherwise the human deletes it. Never run `git push origin --delete`.
8. Report briefly what was deleted (branch, worktree) and the current branch/commit.

Do **not** delete anything if the PR is not merged.
