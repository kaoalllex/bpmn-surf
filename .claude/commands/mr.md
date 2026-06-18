---
description: Push the current feature branch and open an MR into master (with --remove-source-branch)
allowed-tools: Read, Bash(git *), Bash(glab *), Bash(npm test)
---

Push the current feature branch and create the Merge Request into master. This is the canonical wrapper — it guarantees `--remove-source-branch` is always set, so the "delete source branch on merge" checkbox can never be forgotten (the recurring miss the prose rule in `docs/git-workflow.md` did not prevent).

Steps:

1. Confirm the current branch is **not** `master` (`git branch --show-current`). If it is, stop and report — work must be on a feature/fix branch.
2. Run `npm test`. **Do not push with failing tests** — stop and report failures.
3. If `origin/master` has moved ahead, `git rebase origin/master`, resolve conflicts, re-run the tests; push with `--force-with-lease` only on your own branch.
4. Push the branch: `git push -u origin <branch>`.
5. Create the MR into master, **always** with the flag:

   ```
   glab mr create --remove-source-branch --fill --yes
   ```

   Never use `glab mr create --fill --yes` without `--remove-source-branch`.
6. Report the MR link briefly. Do **not** merge the MR or enable auto-merge — the merge is the human's.

See `docs/git-workflow.md` for the full policy. Respond in the language the user opened the conversation with.
