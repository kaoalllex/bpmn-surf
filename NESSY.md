# BPMN Diff for GitLab — Project Overview

**Chrome Extension (Manifest V3)** for visually comparing BPMN 2.0 and DMN diagrams in GitLab merge requests.

## Quick Links

- **[Project Context](.agent/PROJECT_CONTEXT.md)** — architecture, files, constraints, rules for agents
- **[Code Style](.agent/CODE_STYLE.md)** — code style and formatting rules

## Purpose

Comparing two versions of BPMN/DMN diagrams:
- In a GitLab MR (MR branch vs. target branch)
- Against local files

## How It Works

1. **Initialization** (`app.js`) — detection of BPMN/DMN files on GitLab pages
2. **Data Resolution** (`gitlab-repo-provider.js`) — fetching content via the GitLab API
3. **UI Integration** (`gitlab-ui-repo-provider.js`) — "Show schema/decision diff" buttons
4. **Diff Rendering** (`bpmn-differ.js`, `dmn-differ.js`) — visualization with change highlighting

## Key Features

- Smart commit resolution for a merged MR
- LocalStorage caching (master commit history, file content)
- Zoom/pan controls, "Fit view", "Switch branch"
- Download of the current file version
- Toggle highlighting, properties panel
