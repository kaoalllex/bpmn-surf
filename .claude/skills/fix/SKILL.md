---
name: fix
description: Fix bugs in bpmn-surf — the current behavior is wrong and must become correct with a minimal change. Use for "fix", "bug", "error", "doesn't work", "crashes", "isn't found/resolved", "isn't displayed", when there is a stack trace, a 404, an error log, or a description of an incorrect result (including hotkey interception, breakage after a GitLab update, problems with commit/version resolution, the cache, or SPA navigation). Unlike feature (adds new behavior) — here the expected behavior is restored; unlike refactor (behavior stays the same) — here behavior is corrected.
---

# Bug fixing

## Workflow
If a spec/plan for this task already exists in `docs/superpowers/` (from `brainstorming`/`writing-plans`), it covers steps 1–3: start at step 4.

1. **Diagnosis** — study the description/stack trace, localize the code, find the root cause. The code has many `console.debug` — logs with timestamps and their call site (`ConsoleLog.install`) help reconstruct the sequence of events, and `ConsoleLog.tail()` in the differ tab's console prints the same selection a feedback report would carry. A blank white differ tab → look in its console for `... file is unavailable in both versions` (the log contains both raw URLs; usually it is an incorrect resolution of the target commit of an old/merged MR, not a transient failure — retries do not help)
2. **Plan** — minimal change; assess side effects; for a complex fix — confirmation
3. **Implementation** — only what is needed for the fix; fix ≠ refactor
4. **Verification** — the error is fixed, nothing else is affected; run `npm test` (unit + structure tests, it also parses every `src/` script) and the affected e2e specs; check the twin paths (CLAUDE.md); page decoration / navigation / edit-mode changes → the `live-check` skill; if the bug is in a test-covered class (see `docs/testing.md`) — first add a failing test/fixture, then the fix; a non-trivial diff → the `code-reviewer` subagent before `/pr`
5. **Task tracking** — if the bug relates to a task in `docs/issues/` or deserves one: update or create its file per `docs/issues/README.md`

## Rules
- ⚠️ The differ is **view-only, but text must stay selectable/copyable**. When restricting interaction (vetoing bpmn-js events, `BpmnDiffer.EDIT_EVENTS`, disabling editing), verify that mouse selection and Ctrl/Cmd+C copy still work both on the canvas (labels, `bpmn:TextAnnotation`) and in the properties-panel fields — this exact path regressed twice (BUG-0011 → BUG-0014 → BUG-0015)
- Minimal diff, do not change logic unnecessarily
- Add a short comment (in English) if the cause of the bug is non-obvious
- Typical bug sources in the project: GitLab/GitHub DOM selectors (change with platform updates), commit resolution for a merged MR, the localStorage cache, re-initialization on SPA navigation (`mouseup`/`popstate`), the shared differ-page classes (`src/differ/shared/` — changing their API breaks both BPMN and DMN diff), the load order in `utils.js#loadScripts` on the differ page
- If the cause is unclear: stop, lay out the hypotheses, request information

## Analysis template

```
## Problem
## Root cause
## Solution
## Files to change
## Risks
```
