---
description: Write a prompt that continues the current work in a new session and give its path
argument-hint: [what the next session should do]
allowed-tools: Read, Write, Bash(git *), Bash(mkdir *)
---

Write a handoff prompt for a fresh Claude Code session that continues the work: $ARGUMENTS
(if empty — the next step of the current task).

Save it to `docs/superpowers/handoff/<YYYY-MM-DD>-<slug>.md` (local only, not tracked) and
reply with its absolute path, so the human starts the new session with "выполни <path>".

The prompt is self-contained — the new session knows nothing of this one. Structure:

1. First line (Russian by design — it is the prompt text): `Отвечай и задавай вопросы по-русски.`
2. The goal in two or three sentences, the task file (`docs/issues/...`) and the decisions
   already made (point to the task file's sections) — "do not revisit them".
3. The current state: branch, last commit, what is done, what is left, known traps found here.
4. Where to work: the main checkout, a new branch from a fresh `origin/master` (or the
   existing branch, if the work continues on it).
5. The process: the skill (`feature`/`fix`/`refactor`) or `writing-plans` → executing the plan.
6. Before "done": the verification thresholds of CLAUDE.md, `live-check` with the human for
   page/navigation/edit-mode changes, the `code-reviewer` subagent.
7. Rules: one manual step for the human at a time; commit freely on the branch, push and PR
   only after the human's "ok"; no tool attribution in commits.

Keep it short: link to files instead of restating them.
