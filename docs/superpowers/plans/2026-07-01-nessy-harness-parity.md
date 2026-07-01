# Agent Harness Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Agent harness (`AGENT.md` + `.agent/`) a correct, safe, non-rotting backup for working in this repo with a weak / short-context model — by pointing it at the same `docs/*` single source of truth Claude uses, distilling the superpowers *discipline* (not machinery) into a few short skills, and simplifying Agent's git role to branch-only.

**Architecture:** Kill fact-duplication. `.agent/` stops copying project facts and instead points at `docs/architecture.md` / `testing.md` / `git-workflow.md` / `conventions.md` (the source of truth, kept fresh by `conventions.md` §15). `.agent/` keeps only *how to operate as a short-context model* + a distilled discipline skill set. Skills are auto-selected by their `description`, so descriptions are written trigger-rich and mutually distinct, with an explicit backup router in `AGENT.md`.

**Tech Stack:** Markdown + JSON config only. No code changes to `src/`. Verification via `npm test` (must stay green — untouched), `node --check`, JSON parse, and `grep` invariant sweeps, plus a manual Agent dry-run at the end.

## Global Constraints

Copied verbatim from `docs/conventions.md` + this task's decisions. Every task implicitly includes these.

- ⚠️ Do NOT touch `.claude/` or `CLAUDE.md` — the Claude harness stays exactly as-is. This task changes only `AGENT.md`, `.agent/**`, and (one optional task) `docs/conventions.md`.
- ⚠️ Do NOT edit `src/`, `libs/`, `manifest.json`, or tests — this is a harness/docs task, not a code task.
- ⚠️ Do NOT touch the unrelated in-flight files on the parent branch (`test/e2e/differ-dive-out-opener.spec.js` and any `docs/superpowers/plans/2026-06-30-layer2-phase4e-*`); they belong to `feature/e2e-phase4e`.
- Single source of truth: `.agent/**` must contain **zero** duplicated project facts (no file map, no architecture prose, no constraint list copied from `docs/`). Facts live in `docs/`; `.agent/` only points and tells Agent *how to operate*.
- Agent skills are auto-selected by `description` → descriptions must be short, trigger-word-rich, and non-overlapping.
- Agent git contract (this task's decision): Agent works on a human-created feature branch and only `git add` + `git commit` there. It never pushes, opens MRs, merges, switches/creates branches, or commits to `master`. The human does push / MR / merge / review replies.
- Product brand is `bpmn-surf`; internal identifiers / code paths / repo / folder still use the historical `bpmn-diff` name.

---

## Setup (before Task 1)

- [ ] **S1: Isolate the work.** This plan is executed on its **own** branch from fresh `origin/master` (e.g. `feature/agent-harness`), NOT on `feature/e2e-phase4e`. If a worktree was created for it, you are already there. Confirm with `git status` that you are on the Agent branch and the tree is clean of unrelated e2e changes.
- [ ] **S2: Commit this plan** as the first commit on the branch:

```bash
git add docs/superpowers/plans/2026-07-01-agent-harness-parity.md
git commit -m "docs: plan Agent harness parity (single source of truth + discipline skills)"
```

- [ ] **S3: Baseline check** — the unit suite is green before you start (you will confirm it stays green at the end; harness edits should not affect it):

```bash
npm test
```

Expected: passes (`# pass <N>`, `# fail 0`).

---

## Task 1: Rewrite `AGENT.md` (entry + routers)

**Files:**
- Modify (full rewrite): `AGENT.md`

**Interfaces:**
- Produces: the "what to read before what" table (points at `docs/*` + `.agent/*`), the skill-routing backup table, and the simplified git contract that all skills reference.

- [ ] **Step 1: Replace the entire contents of `AGENT.md` with:**

```markdown
# AGENT.md — bpmn-surf

Chrome Extension (Manifest V3) for browsing and comparing BPMN 2.0 and DMN diagrams in GitLab merge requests and repositories. Vanilla JavaScript (ES6+), no frameworks, bundlers, or build step. Our GitLab: https://gitlab.example.com.

(Product brand: `bpmn-surf`. Internal identifiers, code paths, the git repo and the folder still use the historical `bpmn-diff` name.)

## You are a short-context worker — read this first

- Load only what the current task needs (table below). Do NOT read everything up front.
- To find code, dispatch a subagent and ask it for a short answer (file + lines + one line), not file dumps.
- Work in small steps; one concern per change.
- The source of truth is `docs/`. This file and `.agent/` only tell you *how to operate*; the facts live in `docs/`.

## What to read before what

| Before you… | Read |
|-------------|------|
| change any code | `docs/architecture.md` (structure, `src/` layout, script scopes, key-files table) |
| run or write tests | `docs/testing.md` |
| do anything with git | the git contract below (and `docs/git-workflow.md` for facts) |
| write code (style) | `docs/conventions.md` |
| work with the task backlog | `docs/issues/README.md` |
| choose the response language | `.agent/output-language.md` |
| operate as a weak / short-context model | `.agent/PROJECT_CONTEXT.md` |

## Skill routing (skills are auto-selected by their description; this table is your backup)

| If the request is… | Skill |
|--------------------|-------|
| a bug / broken / error / crash / "doesn't work" | `fix` |
| add / new / implement / create a feature | `feature` |
| explain / how does it work / analyze / study | `analyze` |
| clean up / simplify / restructure, same behavior | `refactor` |
| you are about to claim "done / fixed / works" | `verify` (always, before finishing) |
| you are hunting a bug's root cause | `debug` |
| you changed code that has tests | `tests` |

## Git contract (SIMPLIFIED for you)

You always work on a feature branch the human already created.

- Your git scope: `git add` + `git commit` on the **current** branch only.
- Do NOT: `git push`, create MRs, merge, switch/create branches, rebase, or commit to `master`.
- If you are on `master`, STOP and tell the human.
- Push, MR, merge, and answering review comments — the human does these.

## Critical rules (brief; full text in docs/)

- ⚠️ `libs/` — external libraries, generated by `npm run sync:libs`. **Never edit by hand.**
- ⚠️ Do not reorder `content_scripts` in `manifest.json` or `utils.js#loadScripts` (load-order dependencies).
- ⚠️ Shared differ-page classes (`DifferParams`, `DiagramVersions`, `BranchIndicator`, `DiffType`) are used by BOTH the BPMN and DMN differ — check both when changing them.
- ⚠️ Vanilla JS only (ES6+); no new runtime dependencies; no frameworks/bundlers/build step; Chrome MV3.
- ⚠️ Before saying "done": run `npm test` and show the output (see the `verify` skill).
- ⚠️ If asked to invent something (names, codes, structure) — propose first, wait for confirmation.
```

- [ ] **Step 2: Verify no stale facts remain and key sections exist**

```bash
grep -c "BPMN Diff for GitLab" AGENT.md            # expect 0
grep -c "Key Features\|Quick Links" AGENT.md        # expect 0 (old scaffolding gone)
grep -c "Skill routing\|Git contract\|What to read before what" AGENT.md   # expect 3
```

Expected: `0`, `0`, `3`.

- [ ] **Step 3: Commit**

```bash
git add AGENT.md
git commit -m "docs(agent): rewrite entry — read-map, skill router, simplified git contract"
```

---

## Task 2: Thin out `.agent/PROJECT_CONTEXT.md` and `.agent/CODE_STYLE.md` (de-duplicate into pointers)

**Files:**
- Modify (full rewrite): `.agent/PROJECT_CONTEXT.md`
- Modify (full rewrite): `.agent/CODE_STYLE.md`

**Interfaces:**
- Consumes: the read-map from `AGENT.md` (Task 1).
- Produces: the "how to operate" operating layer + LSP guidance that skills lean on.

- [ ] **Step 1: Replace the entire contents of `.agent/PROJECT_CONTEXT.md` with:**

```markdown
# How to operate here (Agent)

You are a coding agent with a **short context window**. This file is about *how to work*, not project facts — the facts are in `docs/` (see the read-map in `AGENT.md`). Do not duplicate them here.

## Short-context tactics

1. **Load just-in-time.** Read only the one `docs/` file the current task needs. Never read the whole `docs/` tree or the full key-files table up front.
2. **Delegate search to a subagent.** To find where something lives or how an API is used, dispatch a subagent and ask for a *short* answer (file + lines + one-line summary), not the file contents. This keeps your context clean.
3. **Small steps.** One concern per change. Make the smallest edit that does the job; never mix refactor with fix/feature.
4. **Verify before you finish.** Never say "done / fixed / works" without running `npm test` and reading its output. See the `verify` skill.

## Hard guardrails (do not cross)

- Never edit anything under `libs/` (regenerated by `npm run sync:libs`).
- Never `git push`, create MRs, merge, rebase, or commit to `master`. Commit to the current feature branch only (see the AGENT.md git contract).
- Do not reorder `content_scripts` / `utils.js#loadScripts`.
- No new runtime dependencies; no frameworks/bundlers/build step; Chrome MV3 only.
- If a change risks behavior outside the task — stop, explain, ask.

## LSP is available

Use LSP for precise analysis instead of guessing (and instead of reading many files):

- `goToDefinition` — where a symbol is defined
- `findReferences` — all usages (do this before touching a shared symbol)
- `hover` — signature/type of an unfamiliar function
- `documentSymbol` / `workspaceSymbol` — explore a file / find a symbol by name
- `diagnostics` — check a file for errors before and after a change
```

- [ ] **Step 2: Replace the entire contents of `.agent/CODE_STYLE.md` with:**

```markdown
# Code Style

The authoritative code-style rules live in **`docs/conventions.md`** ("Code style" section) — the single source of truth, shared with the rest of the tooling. Read it before writing code.

Quick reminder (full rules in `docs/conventions.md`):

- ES6+ vanilla JS; small pure functions; readability > cleverness; no hidden side effects.
- PascalCase classes · camelCase vars/functions · SCREAMING_SNAKE_CASE constants.
- Private members via `#` (not `_`). Single quotes, semicolons, 4-space indent (no tabs).
- `async/await` over `.then`/`.catch`. Comments only when necessary, in English, concise.
```

- [ ] **Step 3: Verify the duplicated facts are gone**

```bash
grep -c "Key Files\|Entry point, initializes\|Directory structure\|External Libraries" .agent/PROJECT_CONTEXT.md   # expect 0
grep -c "docs/conventions.md" .agent/CODE_STYLE.md   # expect >=1
grep -c "docs/" .agent/PROJECT_CONTEXT.md            # expect >=1 (points to source of truth)
```

Expected: `0`, then `>=1`, then `>=1`.

- [ ] **Step 4: Commit**

```bash
git add .agent/PROJECT_CONTEXT.md .agent/CODE_STYLE.md
git commit -m "docs(agent): thin context to operating-layer + point style at docs/conventions.md"
```

---

## Task 3: Create the discipline skills — `verify`, `debug`, `tests`

**Files:**
- Create: `.agent/skills/verify/SKILL.md`
- Create: `.agent/skills/debug/SKILL.md`
- Create: `.agent/skills/tests/SKILL.md`

**Interfaces:**
- Produces: three skills the domain skills (Task 4) reference by name (`verify`, `debug`, `tests`).

- [ ] **Step 1: Create `.agent/skills/verify/SKILL.md` with:**

```markdown
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
```

- [ ] **Step 2: Create `.agent/skills/debug/SKILL.md` with:**

```markdown
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
```

- [ ] **Step 3: Create `.agent/skills/tests/SKILL.md` with:**

```markdown
---
name: tests
description: Write and run unit tests for changed code. Use when adding or changing behavior in a covered file, or when a fix needs a regression test. Triggers - new logic, bug fix, "add a test", changing a class under test.
---

# Skill: tests

The unit suite (`npm test`, `node:test` + jsdom) is your safety net. Read `docs/testing.md` for the layout before writing a test.

## For a bug fix (test-first)

1. Write a test that **reproduces the bug** (asserts the correct behavior). Put it in the mirror path: `src/<path>/x.js` → `test/<path>/x.test.js`.
2. Run `npm test`; confirm the new test **fails** for the right reason.
3. Write the minimal fix.
4. Run `npm test`; confirm it **passes** and nothing else broke.

## For new / changed behavior

1. Implement the change.
2. Add a test in the mirror path covering the new behavior.
3. Run `npm test`; make it green.

## Rules

- Test the **current intended** behavior; never weaken an existing test just to make it pass — that hides a regression.
- A new `src/**/*.js` file needs a mirror test (or an entry in `UNTESTED_BY_DESIGN` with a reason) or the structural test fails — see `docs/testing.md`.
- To wire a new class into the harness: add it to `SCOPE_FILES` and `EXPORTED_NAMES` in `test/support/scope.js` (details in `docs/testing.md`).
- Finish with the `verify` skill.
```

- [ ] **Step 4: Verify frontmatter + descriptions are present**

```bash
for s in verify debug tests; do echo "== $s =="; head -4 ".agent/skills/$s/SKILL.md"; done
grep -l "^description:" .agent/skills/{verify,debug,tests}/SKILL.md | wc -l   # expect 3
```

Expected: each prints a `name:` and `description:` frontmatter; final count `3`.

- [ ] **Step 5: Commit**

```bash
git add .agent/skills/verify .agent/skills/debug .agent/skills/tests
git commit -m "docs(agent): add distilled discipline skills — verify, debug, tests"
```

---

## Task 4: Update the four domain skills (fix / feature / analyze / refactor)

**Files:**
- Modify (full rewrite): `.agent/skills/fix/SKILL.md`
- Modify (full rewrite): `.agent/skills/feature/SKILL.md`
- Modify (full rewrite): `.agent/skills/refactor/SKILL.md`
- Modify (full rewrite): `.agent/skills/analyze/SKILL.md`

**Interfaces:**
- Consumes: `verify`, `debug`, `tests` (Task 3); the git contract + read-map (`AGENT.md`, Task 1).

- [ ] **Step 1: Replace `.agent/skills/fix/SKILL.md` with:**

```markdown
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
```

- [ ] **Step 2: Replace `.agent/skills/feature/SKILL.md` with:**

```markdown
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
```

- [ ] **Step 3: Replace `.agent/skills/refactor/SKILL.md` with:**

```markdown
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
```

- [ ] **Step 4: Replace `.agent/skills/analyze/SKILL.md` with:**

```markdown
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
```

- [ ] **Step 5: Verify references and descriptions**

```bash
grep -l "verify skill\|`verify`" .agent/skills/{fix,feature,refactor}/SKILL.md | wc -l   # expect 3
grep -c "git contract\|Do NOT push" .agent/skills/fix/SKILL.md    # expect >=1
grep -c "debug\|tests" .agent/skills/fix/SKILL.md                  # expect >=2
for s in fix feature analyze refactor; do grep -m1 "^description:" ".agent/skills/$s/SKILL.md"; done
```

Expected: `3`; `>=1`; `>=2`; four distinct trigger-rich description lines.

- [ ] **Step 6: Commit**

```bash
git add .agent/skills/fix .agent/skills/feature .agent/skills/analyze .agent/skills/refactor
git commit -m "docs(agent): wire domain skills to docs/, discipline skills, git contract"
```

---

## Task 5: Align `.agent/settings.json` permissions with the git contract

**Files:**
- Modify: `.agent/settings.json`

**Rationale:** the simplified git contract means Agent must NOT switch branches or rebase. Remove `git checkout` / `git rebase` from the allow-list; add the read-only + test commands the `verify` skill needs. This is the certain, schema-independent part of guardrailing (the optional enforcement hook is Task 6).

- [ ] **Step 1: Replace the entire contents of `.agent/settings.json` with:**

```json
{
  "permissions": {
    "allow": [
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(npm test)",
      "Bash(node --check *)",
      "Bash(mkdir *)",
      "Bash(mv *)",
      "Bash(which *)"
    ]
  },
  "experimental": {
    "lsp": true
  },
  "$version": 3
}
```

- [ ] **Step 2: Verify it is valid JSON and the branch-mutating commands are gone**

```bash
node -e "JSON.parse(require('fs').readFileSync('.agent/settings.json','utf8')); console.log('valid json')"
grep -c "git checkout\|git rebase\|git push" .agent/settings.json   # expect 0
grep -c "npm test\|node --check" .agent/settings.json               # expect 2
```

Expected: `valid json`; `0`; `2`.

- [ ] **Step 3: Commit**

```bash
git add .agent/settings.json
git commit -m "chore(agent): scope permissions to the branch-only git contract + verify tools"
```

---

## Task 6 (OPTIONAL — contingent on Agent's hook schema): enforcement guardrails

**Files:**
- Modify: `.agent/settings.json` (add a `hooks` block) — only if Agent uses the Claude-compatible hook schema.

**Why optional:** the baseline guardrails already live as prose in `AGENT.md` / `PROJECT_CONTEXT.md` / the skills (always effective). Hooks *harden* them, but Agent's hook config schema is unverified. Do this only after confirming the schema; otherwise skip — do not ship a hook you have not confirmed runs.

- [ ] **Step 1: Confirm the hook mechanism.** Check Agent's own docs / an existing example for how `hooks` are configured. Answer: does it accept the Claude-Code `hooks` schema in `settings.json` (event → matcher → command, where a non-zero exit blocks the tool call)?
- [ ] **Step 2a (if YES — Claude-compatible):** add a `hooks` block to `.agent/settings.json` that (a) blocks `Write`/`Edit` whose path is under `libs/`, and (b) blocks `Bash(git push*)`. Example shape to adapt to the confirmed schema:

```json
"hooks": {
  "PreToolUse": [
    {
      "matcher": "Write|Edit",
      "hooks": [{ "type": "command", "command": "case \"$CLAUDE_TOOL_INPUT_FILE_PATH\" in */libs/*|libs/*) echo 'libs/ is generated — do not edit by hand' >&2; exit 2;; esac" }]
    },
    {
      "matcher": "Bash",
      "hooks": [{ "type": "command", "command": "grep -q 'git push' <<<\"$CLAUDE_TOOL_INPUT_COMMAND\" && { echo 'Agent does not push — the human pushes' >&2; exit 2; } || exit 0" }]
    }
  ]
}
```

Verify the exact env-var names and blocking convention against Agent's docs before trusting this; adjust names/quoting to match. Then confirm `node -e "JSON.parse(...)"` still passes and, if possible, that a `git push` attempt is blocked in a Agent session.

- [ ] **Step 2b (if NO / unknown):** skip the hook. Record in the commit message / task notes that enforcement stays prose-only and hooks are deferred pending schema confirmation. Do not invent a schema.
- [ ] **Step 3: Commit** (only if 2a was done):

```bash
git add .agent/settings.json
git commit -m "chore(agent): enforce libs/ + no-push guardrails via hooks"
```

---

## Task 7 (OPTIONAL — contingent on custom-agent support): explorer subagent role

**Files:**
- Create: `.agent/agents/code-explorer.md` (mirror of `.claude/agents/code-explorer.md`)

**Why optional:** the skills already say "delegate search to a subagent". A named explorer role makes that concrete, but only if Agent supports custom agent definitions in `.agent/agents/`.

- [ ] **Step 1: Confirm** Agent discovers custom agent definitions from `.agent/agents/*.md` (same registry idea as Claude's `.claude/agents/`). If not, skip this task.
- [ ] **Step 2 (if supported):** create `.agent/agents/code-explorer.md` based on `.claude/agents/code-explorer.md`, trimmed to a short-context read-only searcher: read-only tools only (Read/Grep/Glob equivalents), instructed to return *file + lines + a one-line summary*, never file dumps. Keep it under ~30 lines. Adjust any Claude-specific tool names to Agent's equivalents.
- [ ] **Step 3: Commit** (only if done):

```bash
git add .agent/agents/code-explorer.md
git commit -m "docs(agent): add read-only code-explorer subagent role"
```

---

## Task 8 (OPTIONAL — low expected yield): distill durable facts from auto-memory

**Files:**
- Possibly modify: one of `docs/architecture.md` / `docs/testing.md` / `docs/git-workflow.md` / `docs/conventions.md` (only if a durable fact is genuinely missing)

**Why optional / low yield:** Claude's `memory/` is currently about Layer-2 e2e phase status (work a backup weak model is unlikely to lead), not durable how-to facts. Reframed option B: pull only *durable, generally-true* project facts that are missing from `docs/`, and put them in `docs/` (NOT in `.agent/`, to preserve single-source).

- [ ] **Step 1:** skim `~/.claude/projects/-Users-kaoalllex-src-my-bpmn-surf/memory/*.md`.
- [ ] **Step 2:** for each memory, ask: is this a durable project fact (not status, not Claude-workflow trivia) that is missing from `docs/`? If yes, add one concise line to the right `docs/` file. If nothing qualifies (the likely outcome), record "no durable gap found" and skip.
- [ ] **Step 3: Commit** (only if a `docs/` file changed):

```bash
git add docs/
git commit -m "docs: capture durable project fact distilled from memory"
```

---

## Task 9 (OPTIONAL — touches shared docs; get the user's OK first): keep the thin layer from rotting

**Files:**
- Modify: `docs/conventions.md` (§ "Hard constraints", the "update the instructions" bullet, line ~15)

**Why:** the `.agent/` operating layer has no facts to rot, but its *operating model* (skills, git contract) can drift when the way-of-working changes. Adding `AGENT.md` / `.agent/` to the existing "update the instructions" checklist keeps it maintained by the same discipline that keeps `docs/` fresh. This edits a shared doc, so confirm with the user during plan review before doing it.

- [ ] **Step 1:** in `docs/conventions.md`, extend the bullet that currently ends "…and the prompts/skills in `.claude/agents/` and `.claude/skills/`" to also mention "and, if the way-of-working changed, `AGENT.md` / `.agent/`". Keep it one clause; do not restructure the file.
- [ ] **Step 2: Commit**

```bash
git add docs/conventions.md
git commit -m "docs(conventions): include AGENT.md/.agent in the update-instructions checklist"
```

---

## Final: Acceptance & handoff

- [ ] **A1: Invariant sweep** — no duplicated facts, no stale strings anywhere in the Agent harness:

```bash
grep -rn "BPMN Diff for GitLab" AGENT.md .agent/ ; echo "exit=$?"     # expect no matches (exit=1)
grep -rn "Entry point, initializes\|## Key Files" .agent/ ; echo "exit=$?"   # expect no matches (exit=1)
grep -rln "docs/" AGENT.md .agent/ | wc -l                           # expect >=3 (points at source of truth)
```

Expected: first two print nothing with `exit=1`; the last is `>=3`.

- [ ] **A2: Unit suite still green** (harness edits must not affect it):

```bash
npm test
```

Expected: `# pass <N>`, `# fail 0`.

- [ ] **A3: Manual Agent dry-run (the real acceptance — for the human).** In a Agent session on a scratch feature branch:
  1. Ask "where is the entry point and how do I run the tests?" → it should navigate to `docs/architecture.md` / `docs/testing.md` and answer correctly (not the old `main.js`-in-root).
  2. Give it a tiny real fix. Confirm it routes `fix` → `debug` → `tests` → `verify`, runs `npm test`, and commits to the branch **without** pushing or opening an MR.
  3. Ask it to edit a file under `libs/` → it should refuse (prose guardrail, or the Task 6 hook if enabled).

- [ ] **A4: Finish per project workflow.** This harness work itself follows the normal `docs/git-workflow.md` (it is Claude's task, not Agent's): the executor may push the branch and open an MR, or hand the branch to the user to review/merge — per the user's preference stated at execution time.

---

## Self-review notes (author)

- **Spec coverage:** single-source-of-truth (Tasks 1–2, 5), discipline distillation (Tasks 3–4), simplified git contract (Tasks 1, 4, 5), guardrails (Task 5 certain + Task 6 optional), reframed option B (Task 8), anti-rot (Task 9) — all covered.
- **Uncertainty is explicit, not placeholder:** Tasks 6 and 7 depend on Agent capabilities this plan cannot verify from the Claude side; each is written as "confirm X → do A, else B", with both branches spelled out. Confirm those two facts (hook schema, custom-agent support) at execution time.
- **No `src/` risk:** the plan touches only `AGENT.md`, `.agent/**`, and (optional, gated) `docs/`. `npm test` is a regression guard, expected unaffected.
