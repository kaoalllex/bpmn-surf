---
name: analyze
description: Analyzes the architecture, working logic, and structure of the code. Use for questions like "how does it work", "analysis", "architecture", "explain the code", "study the code"
---

# Skill: analyze

## When to use
- The user asks "how does it work", "analysis", "architecture"
- You need to explain the working logic of a component
- The code must be studied before changes
- You need to understand the relationships between files
- The user asks to "explain the code", "study"

## Rules

### When analyzing:
1. **Read the context** — study the surrounding code, imports, dependencies
2. **Understand the data flow** — how data passes through the system
3. **Identify dependencies** — which files depend on which
4. **Explain clearly** — simply and to the point, without excessive detail

### Communication
- Explain **what** the code does
- Explain **why** it is done this way (if clear from the context)
- Point out **potential problems** (edge cases, complexity)
- Propose **improvements** only if explicitly asked

## Output format

When analyzing, provide:
1. **Brief summary** — what the component/function does
2. **Key logic** — the main steps/algorithm
3. **Dependencies** — what it depends on, what it uses
4. **Potential problems** — if any (optional)

## Examples

### Good trigger phrases
- "how does bpmn-differ.js work"
- "architecture analysis"
- "explain the logic of gitlab-repo-provider"
- "study the code before changes"
- "how is diagram comparison structured"

### Expected output structure
```
## Summary
Brief description (2-3 sentences)

## How it works
1. Step 1
2. Step 2
...

## Dependencies
- File A
- File B

## Notes
Important details or potential problems
```
