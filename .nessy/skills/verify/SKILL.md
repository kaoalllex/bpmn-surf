---
name: verify
description: Confirm work is actually correct before saying it is done. Use ALWAYS before claiming "done", "fixed", "works", "ready", or finishing any code change. Triggers - finishing a task, about to report success.
---

# Skill: verify

Run this before you tell the human a change is done. A claim without a check is a guess.

## Steps (do all, in order)

1. **Run the tests:** `npm test`. Read the output.
2. **If anything is red:** it is NOT done. Fix it (use the `debug` skill), then run again.
3. **Syntax-check touched JS** (if you edited any `.js`): `node --check <file>` for each changed file.
4. **Re-read your diff:** `git diff`. Confirm you did only what the task asked — no stray edits, no `console.log`, nothing under `libs/`.
5. **Report with evidence.** Say "done" only after step 1 passed. Paste the final test line (e.g. `# pass N / # fail 0`); do not paraphrase it.

## Rules

- Never say "should work" / "this fixes it" without having run `npm test`.
- If you could not run a check, say so explicitly — do not imply it passed.
- Tests red = task not finished. No exceptions.
