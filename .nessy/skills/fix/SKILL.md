---
name: fix
description: Fix bugs and errors in the code. Use for requests like "fix", "bug", "error", "repair"
---

# Skill: fix

## When to use
- The user reports an error: "fix", "bug", "error", "repair"
- There is a stack trace or a problem description
- A regression must be fixed
- A hotfix for a critical problem is required

## Workflow

### 1. Diagnosis
- Study the error description or stack trace
- Localize the problematic code
- Understand the root cause
- Reproduce the problem if possible

### 2. Fix plan
- Propose the minimal change for the fix
- Assess the risk of side effects
- If the fix is complex — explain the plan and get confirmation

### 3. Implementation
- Apply the minimal change
- Do not use the fix as an excuse for refactoring
- Preserve existing behavior

### 4. Verification
- Check that the error is fixed
- Make sure other parts of the system are not affected
- Run the tests if there are any

## Rules

### When fixing:
1. **Minimal changes** — only what is needed for the fix
2. **Do not refactor** — fix ≠ refactor, do not mix them
3. **Preserve behavior** — do not change logic unnecessarily
4. **Comment** — add a comment if the cause of the bug is non-obvious

### If unsure:
- **Stop** — stop if the cause is unclear
- **Explain** — explain what was found and what hypotheses there are
- **Ask** — request additional information or confirmation

## Bug analysis template

```
## Problem
Error description

## Root cause
The cause of the problem in the code

## Solution
How it will be fixed

## Files to change
- file1.js
- file2.js

## Risks
Possible side effects
```

## Examples

### Good trigger phrases
- "fix the error in bpmn-differ.js"
- "bug: the compare button doesn't work"
- "repair the memory leak"
- "fix: null pointer in GitLabRepoProvider"
- "error when loading DMN file"

### Bad (needs clarification)
- "everything is broken" — a problem description is needed
- "fix it and add logging" — mixing fix and feature
