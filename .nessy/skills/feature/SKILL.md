---
name: feature
description: Implement new functions for the Chrome Extension. Use for requests like "add", "new feature", "implement", "create"
---

# Skill: feature

## When to use
- The user asks to "add", "new feature", "implement", "create"
- The extension's functionality needs to be extended
- A new UI element or behavior must be added
- Integration with new APIs is required

## Workflow

### 1. Clarifying requirements
- Make sure the requirements are clear and complete
- If critical information is missing — ask clarifying questions
- Propose implementation options when there is a choice

### 2. Implementation plan
- Describe the implementation steps
- State which files will be affected
- Propose the solution architecture

### 3. Confirmation
- Get the user's confirmation of the plan
- **Do NOT start** the implementation without confirmation for complex changes

### 4. Implementation
- Follow the plan
- Adhere to the [code style](../../CODE_STYLE.md)
- Write tests when appropriate

### 5. Verification
- Check that the new feature works
- Make sure existing behavior is not broken

## Rules

### When developing:
1. **Follow the architecture** — do not violate the existing structure
2. **Preserve compatibility** — do not break existing functionality
3. **Minimal changes** — do not make unnecessary changes
4. **Clean code** — follow the [style rules](../../CODE_STYLE.md)

### Integration points
- New components must integrate with the existing architecture
- Use existing providers and utilities where possible
- Avoid logic duplication

## Examples

### Good trigger phrases
- "add an export button"
- "new feature: comparison with a local file"
- "implement syntax highlighting"
- "create a setting for the highlighting color"
- "implement dark mode toggle"

### Plan example
```
## Implementation plan

### Files
- `gitlab-ui-repo-provider.js` — add a button
- `app.js` — event handler
- `styles.css` — button styles

### Steps
1. Add the button to the UI
2. Add a click handler
3. Implement the export logic
4. Add styles

### Risks
- May require a manifest.json change for permissions
```
