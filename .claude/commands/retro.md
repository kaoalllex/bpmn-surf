---
description: Retrospective on recent Claude Code work; proposes prompt/harness improvements
argument-hint: [scope, e.g. "last 20 sessions" or "since 2026-06-01"]
allowed-tools: Bash(git log:*), Bash(git diff:*), Bash(ls:*), Bash(grep:*), Bash(jq:*), Read, Grep, Glob, Task
---

Run a retrospective on our recent Claude Code work and propose improvements.
Scope: $ARGUMENTS (default: last ~20 sessions / ~2 weeks).

Collect context first, then delegate analysis to the `retro-analyst` subagent.

## Data to collect
- Recent commits:
  !`git log --oneline -n 50`
- Current project instructions:
  @CLAUDE.md
- Recent session transcripts (verify path for this machine; sample most recent / largest / most error-prone):
  !`ls -lt ~/.claude/projects/*/ 2>/dev/null | head -40`
- Quick error/retry signal across transcripts (tune the path):
  !`grep -rl -i -E "error|failed|let me try|that didn'?t work|i apologize" ~/.claude/projects/*/*.jsonl 2>/dev/null | head -20`

Then invoke the `retro-analyst` subagent with the collected context. Have it produce: findings, proposed CLAUDE.md edits, proposed harness/agent edits, and suggested eval cases. Present the report and ask me before applying ANY edit to CLAUDE.md or config.
