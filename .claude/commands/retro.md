---
description: Retrospective on recent Claude Code work; proposes prompt/harness improvements
argument-hint: [scope, e.g. "last 20 sessions" or "since 2026-06-01"]
allowed-tools: Bash(git log:*), Bash(git diff:*), Bash(ls:*), Bash(grep:*), Bash(jq:*), Read, Grep, Glob, Agent
---

Run a retrospective on our recent Claude Code work and propose improvements.
Scope: $ARGUMENTS (default: last ~20 sessions / ~2 weeks).

Collect context first, then delegate analysis to the `retro-analyst` subagent.

## Data to collect
- Recent commits:
  !`git log --oneline -n 50`
- Current project instructions:
  @CLAUDE.md
- Recent session transcripts of this project only — the main checkout (`*-bpmn-surf`) and the task worktrees (`*-bpmn-diff-<slug>`); sample most recent / largest / most error-prone. Never read other projects' transcripts:
  !`ls -lt ~/.claude/projects/*-bpmn-surf/*.jsonl ~/.claude/projects/*-bpmn-diff-*/*.jsonl 2>/dev/null | head -40`
- Quick error/retry signal across those transcripts:
  !`grep -l -i -E "error|failed|let me try|that didn'?t work|i apologize" ~/.claude/projects/*-bpmn-surf/*.jsonl ~/.claude/projects/*-bpmn-diff-*/*.jsonl 2>/dev/null | head -20`

Then invoke the `retro-analyst` subagent with the collected context, passing it the same two transcript globs as its only transcript source. Have it produce: findings, proposed CLAUDE.md edits, proposed harness/agent edits, and suggested eval cases. Present the report and ask me before applying ANY edit to CLAUDE.md or config.
