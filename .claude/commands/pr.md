---
description: Push the current feature branch and open a PR into master
allowed-tools: Read, Bash(git *), Bash(gh *), Bash(npm test), Bash(npm run test:e2e), Agent
---

Push the current feature branch and create the Pull Request into master. Running this command is the human's "ok" to push.

Steps:

1. Confirm the current branch is **not** `master` (`git branch --show-current`). If it is, stop and report — work must be on a feature/fix branch.
2. Run `npm test`, then `npm run test:e2e`. **Do not push with failing tests** — stop and report failures.
3. If the diff against `origin/master` is non-trivial and the `code-reviewer` subagent has not reviewed it in this session, run it now; fix blocking findings (as new commits) before pushing.
4. If `origin/master` has moved ahead, `git rebase origin/master`, resolve conflicts, re-run the tests; push with `--force-with-lease` only on your own branch.
5. Push the branch: `git push -u origin <branch>`.
6. Create the PR into master:

   ```
   gh pr create --base master --fill
   ```

7. Report the PR link, then wait for CI: `gh pr checks <n> --watch`. Report pass/fail. On a red run, investigate the failure; if master is red too (`gh run list -b master -L 1`), say so.
8. Do **not** merge the PR or enable auto-merge — the merge is the human's.

The head branch is deleted on merge by the repository's "Automatically delete head branches"
setting, not by a flag on this command — so there is no per-PR flag to forget. Check it once
with `gh api repos/{owner}/{repo} --jq .delete_branch_on_merge`; if it is `false`, tell the
human rather than changing the repository setting yourself.

See `docs/git-workflow.md` for the full policy.
