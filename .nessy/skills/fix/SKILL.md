---
name: fix
description: Repair broken behavior with a minimal change. Use for "fix", "bug", "error", "crash", "doesn't work", "isn't shown", a stack trace, a 404, or a wrong result. Not for new behavior (use feature) or pure cleanup (use refactor).
---

# Skill: fix

Repair the wrong behavior with the smallest correct change.

## Workflow

1. **Read what you need.** `docs/architecture.md` for the relevant area; find the code via a subagent search + LSP, not by reading many files.
2. **Find the root cause** — use the `debug` skill. State the cause in one sentence before editing.
3. **Add a failing regression test** — use the `tests` skill (test-first).
4. **Apply the minimal fix.** Do not refactor, do not add features. Add a short English comment only if the cause is non-obvious.
5. **Verify** — use the `verify` skill (`npm test` green, re-read the diff).
6. **Commit** to the current feature branch (`git add` + `git commit`). Do NOT push or open an MR — the human does that (see the AGENT.md git contract).

## Rules

- Minimal change; fix ≠ refactor — never mix them.
- Preserve all other behavior.
- If the cause is unclear — stop and report (from the `debug` skill), do not guess-patch.
