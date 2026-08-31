---
description: After the human merged the PR — sync master and delete the merged local feature branch
allowed-tools: Read, Bash(git *), Bash(gh *)
---

The human has just merged the PR. Do the local cleanup from `docs/git-workflow.md` ("Finishing the task / cleanup"). This is the explicit cleanup command — it is the only trigger that authorizes deleting the branch.

Steps:

1. Determine the feature branch to clean up:
   - If the current branch is **not** `master`, that is the branch.
   - If already on `master`, find the merged feature branch with `git branch --merged origin/master` (exclude `master` itself). If several, or none is obvious, **list them and ask** which to delete — never guess.
2. Sync master: `git checkout master` → `git pull`.
3. **Safety check before deleting** — confirm the branch is really merged:
   - `git branch -d <branch>` (with `-d`, **never** `-D`). `-d` refuses to delete a branch not merged into the current HEAD; if it refuses, **stop and report** — the PR may not actually be merged yet, do not force.
   - Optionally double-check via `gh pr list --head <branch> --state merged` before deleting.
4. **Do NOT touch the remote branch.** GitHub deletes the head branch on merge when the repository has "Automatically delete head branches" enabled; otherwise the human deletes it. Never run `git push origin --delete` — only the local branch is yours to clean up.
5. Report briefly what was deleted (local) and the current branch/commit.

Do **not** delete anything if the PR is not merged. Respond in the language the user opened the conversation with.
