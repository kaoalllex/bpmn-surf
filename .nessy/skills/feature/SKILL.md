---
name: feature
description: Add new behavior that did not exist before. Use for "add", "new feature", "implement", "create", "support a new case". Not for repairing existing behavior (use fix) or cleanup (use refactor).
---

# Skill: feature

Add new behavior while keeping the existing architecture and UX intact.

## Workflow

1. **Clarify first.** If the request is ambiguous or large, ask before coding. If you must invent anything (names, structure, format) — propose it and wait for confirmation (a hard project rule).
2. **Sketch a mini-plan.** Before writing code, list the 2–4 steps and the files each touches. Read `docs/architecture.md` for where things go; reuse existing providers/utilities, do not duplicate.
3. **Implement** in small steps, following `docs/conventions.md` (style) and existing patterns.
4. **Add tests** for the new behavior — use the `tests` skill.
5. **Verify** — use the `verify` skill (`npm test` green).
6. **Commit** to the current feature branch. Do NOT push or open an MR — the human does that (see the AGENT.md git contract).

## Rules

- Follow the existing architecture; no frameworks, bundlers, or new runtime dependencies.
- A new differ-page JS file must be added to BOTH `utils.js#loadScripts` and `manifest.json#web_accessible_resources` (see `docs/architecture.md`).
- Preserve backward compatibility and existing UX.
