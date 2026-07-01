---
name: refactor
description: Improve code structure/readability with NO behavior change. Use for "refactor", "simplify", "clean up", "remove duplication", "rename", "extract". If behavior must change, use fix or feature instead.
---

# Skill: refactor

Improve structure while keeping observable behavior exactly the same.

## Workflow

1. **Explain what and why** before touching code; propose the plan (files + changes) and wait for confirmation on anything structural.
2. **Read the area** — `docs/architecture.md`; for a shared symbol run `findReferences` (LSP) or a subagent search across all JS first.
3. **Refactor in small steps**, one concern at a time. Follow `docs/conventions.md`.
4. **Verify behavior is unchanged** — use the `verify` skill; existing tests must stay green without being weakened.
5. **Commit** to the current feature branch. Do NOT push or open an MR (see the AGENT.md git contract).

## Rules

- Preserve behavior, UI, and backward compatibility exactly.
- Do not mix refactoring with a fix or feature.
- The shared differ-page classes (`DifferParams`, `DiagramVersions`, `BranchIndicator`, `DiffType`) are used by both differs — check both.
- If a "refactor" would change behavior — stop and switch to `fix`/`feature` with confirmation.
