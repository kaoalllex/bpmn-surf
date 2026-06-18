---
description: After the human merged the MR — sync master and delete the merged feature branch (local + remote)
allowed-tools: Read, Bash(git *), Bash(glab *)
---

The human has just merged the MR. Do the local cleanup from `docs/git-workflow.md` ("Finishing the task / cleanup"). This is the explicit cleanup command — it is the only trigger that authorizes deleting the branch.

Steps:

1. Determine the feature branch to clean up:
   - If the current branch is **not** `master`, that is the branch.
   - If already on `master`, find the merged feature branch with `git branch --merged origin/master` (exclude `master` itself). If several, or none is obvious, **list them and ask** which to delete — never guess.
2. Sync master: `git checkout master` → `git pull`.
3. **Safety check before deleting** — confirm the branch is really merged:
   - `git branch -d <branch>` (with `-d`, **never** `-D`). `-d` refuses to delete a branch not merged into the current HEAD; if it refuses, **stop and report** — the MR may not actually be merged yet, do not force.
   - Optionally double-check via `glab mr list --source-branch <branch> --state merged` before deleting.
4. Remote branch: GitLab usually removes it on merge (the `--remove-source-branch` flag from `/mr`). If it still exists (`git ls-remote --heads origin <branch>` returns a line), delete it: `git push origin --delete <branch>`.
5. Report briefly what was deleted (local + remote) and the current branch/commit.

Do **not** delete anything if the MR is not merged. Respond in the language the user opened the conversation with.
