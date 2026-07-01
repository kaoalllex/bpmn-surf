---
name: debug
description: Find the root cause of a bug before fixing it. Use when a test fails, behavior is wrong, there is a stack trace, or a fix attempt did not work. Triggers - "why does this fail", "still broken", unexpected result.
---

# Skill: debug

Do not guess-and-patch. Find the cause first.

## Steps

1. **Reproduce.** Get the exact failing case: the failing test, the input, the wrong output. If you cannot reproduce it, say so and ask for the case.
2. **Read the actual error.** For a test failure the assertion diff + stack are already in the `npm test` output — read them there; do not rerun just to look again (see `docs/testing.md`).
3. **Locate the root cause.** Use LSP (`goToDefinition`, `findReferences`) and/or a subagent search to trace where the wrong value comes from. State the cause in one sentence before touching code.
4. **Confirm the hypothesis** cheaply (a log line, a narrowed test) before writing the fix.
5. **Minimal fix.** Change only what the root cause needs. Do not refactor.
6. **Verify** — use the `verify` skill (`npm test` green).

## Rules

- One sentence of root cause before any edit. If you cannot state it, keep investigating.
- Do not stack speculative fixes. Revert a failed attempt before trying another.
- If after honest effort the cause is unclear — stop and report what you found and your best hypotheses.
