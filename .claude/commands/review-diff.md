---
description: Review the current uncommitted changes with the code-reviewer subagent
allowed-tools: Bash(git *), Agent
---

Context:
- Status: !`git status --short`
- Diff: !`git diff HEAD --stat`

Run the `code-reviewer` subagent to review the current changes (`git diff HEAD`, including staged). If there are no changes — report it and stop. Pass it the additional focus from the arguments, if provided: $ARGUMENTS

Summarize the verdict and blocking findings in the language the user opened the conversation with.
