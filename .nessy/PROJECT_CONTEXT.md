# Project Context: bpmn-surf

## Purpose
Chrome Extension (Manifest V3) for **visually comparing BPMN 2.0 and DMN diagrams** inside **GitLab merge requests**.

## Core Functionality
- Detects BPMN/DMN files in GitLab MRs or branch views
- Loads two versions of a diagram (MR branch vs. target branch)
- Renders them with visual highlighting of semantic differences
- Supports comparing with local files

## Architecture

```
Entry Point → App → Providers → Differs → UI
   (main.js)   |      |          |         |
               |      |          |         └─ bpmn-differ.js / dmn-differ.js
               |      |          └─ GitLabRepoProvider (data)
               |      └─ GitLabUIRepoProvider (buttons)
               └─ Dependencies (moddle, reloader, detector)
```

## Key Files

| File | Purpose |
|------|---------|
| `main.js` | Entry point, initializes the App |
| `app.js` | Main application class, orchestrates workflow |
| `bpmn-differ.js` | BPMN diff logic, rendering, highlighting (~2000 lines) |
| `dmn-differ.js` | DMN diff logic, table/DRD visualization |
| `gitlab-repo-provider.js` | GitLab API integration, commit/branch resolution |
| `gitlab-ui-repo-provider.js` | UI button injection, file selection |
| `repo-provider.js` | Base interface for repo providers |
| `ui-repo-provider.js` | Base interface for UI providers |
| `models.js` | DTOs: `FileType`, `ProjectInfo`, `MergeRequestInfo` |
| `utils.js` | Shared helpers: DOM, HTTP, XML parsing, script loading |
| `config.js` | Constants (e.g., `MASTER_BRANCH_NAME`) |
| `file-type-detector.js` | File extension detection |
| `camunda-bpmn-moddle-manager.js` | Camunda moddle loading/caching |
| `master-commit-manager.js` | Master branch commit history with localStorage cache |
| `page-reloader.js` | Page reload protection (max 3 attempts) |
| `styles.css` | UI styles for diff highlighting |

## External Libraries (`libs/`)

- **bpmn-js** — BPMN viewer/modeler
- **dmn-js** — DMN viewer (DRD, decision tables)
- **bpmn-js-properties-panel** — Properties panel for BPMN
- **camunda-bpmn-moddle** — Camunda-specific BPMN metadata

⚠️ **Critical**: `libs/` is external API — **DO NOT MODIFY**.

## Technical Constraints

| Constraint | Description |
|------------|-------------|
| ⚠️ `libs/` | External API — **DO NOT MODIFY** |
| ⚠️ `manifest.json` | Do not change without explicit request |
| ⚠️ No TypeScript | Plain JavaScript (ES6+) only |
| ⚠️ No frameworks | No React, Vue, Angular, etc. |
| ⚠️ No build step | Vanilla JS, no bundlers |
| ⚠️ Chrome MV3 | Target Manifest V3 for extension APIs |
| ⚠️ Backward compatibility | Preserve existing behavior and UX |
| ⚠️ Incremental changes | Small, reviewable diffs |

## Agent Rules

### Agents MAY:
- Refactor existing project files for clarity and maintainability
- Improve internal structure and naming
- Reduce duplication
- Simplify logic
- Improve separation of concerns
- Suggest small, focused improvements

All changes must:
- Preserve existing behavior
- Preserve public-facing UI and user flow
- Keep backward compatibility

### Agents MUST NOT:
- Change extension behavior or UX without explicit request
- Introduce new dependencies
- Modify `manifest.json` unless explicitly instructed
- Touch `libs/` directory
- Rewrite the project architecture wholesale
- Refactor global variables without careful analysis (they store critical state)
- Change the order of script loading in `manifest.json` (dependencies matter)
- Introduce build tools, bundlers, or frameworks

### Refactoring Guidelines

When refactoring:
1. **One concern per change**
2. Keep diffs small and focused
3. Do not mix refactoring with feature changes
4. If unsure — explain assumptions before changing code

If behavior might change:
- Stop
- Explain the risk
- Ask for confirmation

## LSP Integration

LSP is enabled for this project (`.lsp.json` is configured, `typescript-language-server` is available).

### Available LSP operations

Agents should use the LSP tool for code analysis:

| Operation | When to use |
|----------|-------------------|
| `goToDefinition` | Find where a function/class/variable is defined |
| `findReferences` | Find all usages of a symbol |
| `hover` | Get type/signature information for a function |
| `documentSymbol` | Explore a file's structure (classes, functions) |
| `workspaceSymbol` | Find a symbol by name across the whole project |
| `diagnostics` | Check a file for errors |
| `codeActions` | Find available refactorings/fixes |

### Analyzing external libraries

To study the API of external libraries (`libs/`, npm packages):

1. **bpmn-js, dmn-js**: Use `workspaceSymbol` to search for classes/methods
2. **Unknown API**: Use `hover` to get signatures and types
3. **Finding examples**: Use `findReferences` to find how the API is used in the project

Example workflow when studying an unfamiliar method:
```
1. goToDefinition → find the implementation
2. hover → get the signature and type
3. findReferences → find usage examples
4. diagnostics → confirm there are no errors
```

### Best Practices

- **Always check diagnostics** before making changes
- **Use `hover`** to clarify types and signatures
- **Find all references** before refactoring public APIs
- **Study definitions** before using unfamiliar functions

## Default Assumptions

Unless explicitly stated otherwise:
- Read-only behavior is intended
- Performance is "good enough" for MR-sized diagrams
- Simplicity > abstraction
