---
name: analyze
description: Explain how existing code works, without changing it. Use for "how does it work", "explain", "architecture", "study", "what does this do", or as a first step before editing unfamiliar code.
---

# Skill: analyze

Explain the code clearly; make no changes.

## Workflow

1. **Start from `docs/architecture.md`** for the big picture, then narrow to the relevant files.
2. **Delegate the reading** — for anything beyond a couple of files, dispatch a subagent and ask for a short structured summary; use LSP (`documentSymbol`, `hover`, `findReferences`) for precise structure.
3. **Explain**: what it does → key steps / data flow → dependencies → notable edge cases or risks.

## Output format

- **Summary** (2–3 sentences)
- **How it works** (numbered steps / data flow)
- **Dependencies** (files it uses / that use it)
- **Notes** (edge cases, risks — optional)

## Rules

- Propose improvements only if explicitly asked (then switch to `refactor`/`fix`/`feature`).
- Prefer a subagent + LSP over dumping many files into your context.
