---
name: refactor
description: Improve the structure and readability of the code without changing behavior. Use for requests like "refactor", "simplify", "clean up the code", "improve the code"
---

# Skill: refactor

## When to use
- The user asks to "refactor", "improve the code", "simplify", "clean up the code"
- Code duplication is found
- The logic is too complex or convoluted
- Separation of concerns needs improvement
- Variable/function names do not reflect their purpose

## Rules

### What is ALLOWED:
- Refactor existing files for clarity and maintainability
- Improve internal structure and naming
- Reduce code duplication
- Simplify logic
- Improve separation of concerns
- Propose small, focused improvements

### Requirements for changes:
- Preserve existing behavior **exactly**
- Preserve the public UI and the user flow
- Preserve backward compatibility

### Refactoring Guidelines
1. **One concern per change** — one task at a time
2. Keep diffs small and focused
3. Do not mix refactoring with feature changes
4. If unsure — explain assumptions before changing code

### If behavior might change:
- **Stop**
- **Explain the risk**
- **Ask for confirmation**

## Communication
- Explain **why** the refactoring is proposed
- Describe the **trade-offs**
- Avoid overengineering
- Ask before structural changes

## Workflow

1. **Explain** what is planned to refactor and why
2. **Propose a plan** with specific files and changes
3. **Wait for confirmation** before applying changes
4. **Apply** changes incrementally
5. **Verify** that behavior has not changed

## Examples

### Good trigger phrases
- "refactor bpmn-differ.js"
- "simplify this function"
- "clean up the code from duplication"
- "improve the file structure"
- "reduce duplication in this code"

### Bad (needs clarification)
- "rewrite everything from scratch" — too large in scope
- "add logging and clean up the code" — mixing feature and refactoring
