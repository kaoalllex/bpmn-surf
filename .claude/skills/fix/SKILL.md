---
name: fix
description: Fix bugs in bpmn-surf — the current behavior is wrong and must become correct with a minimal change. Use for "fix", "bug", "error", "doesn't work", "crashes", "isn't found/resolved", "isn't displayed", when there is a stack trace, a 404, an error log, or a description of an incorrect result (including hotkey interception, breakage after a GitLab update, problems with commit/version resolution, the cache, or SPA navigation). Unlike feature (adds new behavior) — here the expected behavior is restored; unlike refactor (behavior stays the same) — here behavior is corrected.
---

# Bug fixing

## Workflow
1. **Diagnosis** — study the description/stack trace, localize the code, find the root cause. The code has many `console.debug` — logs with timestamps (`appendTimeToConsoleLogs`) help reconstruct the sequence of events. A blank white differ tab → look in its console for `... file is unavailable in both versions` (the log contains both raw URLs; usually it is an incorrect resolution of the target commit of an old/merged MR, not a transient failure — retries do not help)
2. **Plan** — minimal change; assess side effects; for a complex fix — confirmation
3. **Implementation** — only what is needed for the fix; fix ≠ refactor
4. **Verification** — the error is fixed, nothing else is affected; `node --check` on every changed js file (the vm harness parses only the files in `SCOPE_FILES` — a syntax error in `bpmn-differ.js`, `dmn-differ.js`, `app.js` or `main.js` leaves `npm test` green and surfaces only in the browser), then run `npm test` (unit tests, ~0.5 sec); if the bug is in a test-covered class (see `docs/testing.md`) — first add a failing test/fixture, then the fix
5. **Task tracking** — if the bug relates to a task in `docs/issues/` (or it is a new bug): update its file per `docs/issues/README.md` — add an entry to the "Work log" (model · date · commit/branch + what was done) and set `status` (`done`/`partial`); when `done` — move the file to `docs/issues/archive/bugs/` (`git mv`). No file, but the bug is worth recording — create a new file in `docs/issues/bugs/`

## Rules
- ⚠️ The differ is **view-only, but text must stay selectable/copyable**. When restricting interaction (vetoing bpmn-js events, `BpmnDiffer.EDIT_EVENTS`, disabling editing), verify that mouse selection and Ctrl/Cmd+C copy still work both on the canvas (labels, `bpmn:TextAnnotation`) and in the properties-panel fields — this exact path regressed twice (BUG-0011 → BUG-0014 → BUG-0015)
- Minimal diff, do not change logic unnecessarily
- Add a short comment (in English) if the cause of the bug is non-obvious
- Typical bug sources in the project: GitLab DOM selectors (change with GitLab updates), commit resolution for a merged MR, the localStorage cache, re-initialization on SPA navigation (`mouseup`/`popstate`), the shared differ-page classes (`DifferParams`, `DiagramVersions`, `BranchIndicator`, `DiffType` — changing their API breaks both BPMN and DMN diff), the load order in `utils.js#loadScripts` on the differ page
- If the cause is unclear: stop, lay out the hypotheses, request information
- The Bash cwd is the repo root and persists between calls — do not prepend `cd <repo>` to commands (it adds noise, and `cd` inside a compound command can trigger a permission prompt)

## Analysis template

```
## Problem
## Root cause
## Solution
## Files to change
## Risks
```
