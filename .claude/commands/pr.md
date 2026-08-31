---
description: Push the current feature branch and open a PR into master
allowed-tools: Read, Bash(git *), Bash(gh *), Bash(npm test)
---

Push the current feature branch and create the Pull Request into master.

Steps:

1. Confirm the current branch is **not** `master` (`git branch --show-current`). If it is, stop and report — work must be on a feature/fix branch.
2. Run `npm test`. **Do not push with failing tests** — stop and report failures.
3. If `origin/master` has moved ahead, `git rebase origin/master`, resolve conflicts, re-run the tests; push with `--force-with-lease` only on your own branch.
4. Push the branch: `git push -u origin <branch>`.
5. Create the PR into master:

   ```
   gh pr create --base master --fill
   ```

6. Report the PR link briefly. Do **not** merge the PR or enable auto-merge — the merge is the human's.

The head branch is deleted on merge by the repository's "Automatically delete head branches"
setting, not by a flag on this command — so there is no per-PR flag to forget. Check it once
with `gh api repos/{owner}/{repo} --jq .delete_branch_on_merge`; if it is `false`, tell the
human rather than changing the repository setting yourself.

See `docs/git-workflow.md` for the full policy. Respond in the language the user opened the conversation with.
