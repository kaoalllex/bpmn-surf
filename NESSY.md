# BPMN Diff for GitLab — Project Overview

## Purpose
Chrome Extension (Manifest V3) for **visual comparison of BPMN 2.0 and DMN diagrams** inside **GitLab merge requests**.

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
| `manifest.json` | Chrome extension config (MV3), content scripts, permissions |
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

⚠️ **Per AGENTS.md**: `libs/` is external API — **DO NOT MODIFY**.

## How It Works

1. **Initialization** (`app.js`)
   - Listens for page loads, navigation (`popstate`), and user interactions
   - Detects if on GitLab MR diffs tab or branch file view

2. **Data Resolution** (`gitlab-repo-provider.js`)
   - Extracts project info, MR details, commit IDs
   - Handles merged MRs by finding previous commit on target branch
   - Caches API responses and master commit history

3. **UI Integration** (`gitlab-ui-repo-provider.js`)
   - Injects "Show schema diff" / "Show decision diff" buttons
   - Supports local file comparison

4. **Diff Rendering** (`bpmn-differ.js`, `dmn-differ.js`)
   - Opens new window with bpmn-js/dmn-js viewers
   - Highlights:
     - **Added** elements (green)
     - **Removed** elements (red)
     - **Changed** elements (blue)
   - BPMN: Shows property-level diffs in side panel
   - DMN: Highlights table cells, inputs/outputs, rules

## Key Features

- **Smart commit resolution** for merged MRs
- **LocalStorage caching** for master commit history (1 hour TTL)
- **File content caching** to avoid repeated fetches
- **Zoom/pan controls**, "Fit view", "Switch branch"
- **Download** current branch file
- **Highlighting toggle** for changed elements
- **Properties panel** showing changed BPMN element properties

## Technical Constraints

- **Language**: Plain JavaScript (ES6+)
- **No build step** — vanilla JS, no bundlers
- **No frameworks** — no React, Vue, etc.
- **No TypeScript**
- **GitLab-specific** — DOM selectors and API endpoints are GitLab-tailored
- **Content script** — runs on `gitlab.example.com/*` and `gitlab.com/*`

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

### Default Assumptions

Unless explicitly stated otherwise:
- Read-only behavior is intended
- Performance is "good enough" for MR-sized diagrams
- Simplicity > abstraction

### Agent Communication Rules

Agents should:
- Explain *why* a refactor is proposed
- Describe trade-offs
- Avoid overengineering
- Ask before making structural changes

## Project Constraints

These constraints apply to **all agent tasks**:

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

## Current Version
**0.17.1** (from `manifest.json`)
