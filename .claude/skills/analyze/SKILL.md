---
name: analyze
description: Analyze and explain the architecture, logic, and structure of the BPMN Diff code — without making changes. Use when you need to understand or explain existing code: "how does it work", "why", "what does it do", "break it down", "study", "explain", "architecture", "data flow". Also as a first step before editing unfamiliar code. Do NOT use when asked to change, add, or fix — then the relevant skill (feature/fix/refactor) will analyze the code itself if needed.
---

# Code analysis

## When to use
- "How does X work", "explain the logic of Y", "architecture analysis" questions
- Studying code before changes
- Understanding the relationships between files

## How to analyze
1. Start with `docs/architecture.md` — it describes the architecture, the data flow, the two script scopes, the shared differ-page classes (bpmn↔dmn), and the table of key files
2. Read the surrounding context: which global functions/classes are used. There are two scopes: content scripts of the GitLab page (order in manifest.json) and the differ page (order in utils.js#loadScripts)
3. Trace the data flow: App → RepoProvider → openDiffer → differ (bpmn-differ.js/dmn-differ.js — orchestrator classes; the logic lives in class files: params, versions, view, comparator, highlighter, viewport, etc.)
4. For large files, first Grep by function/method names, then read the needed sections
5. `libs/` — external libraries; study their API by how it is used in the project code, not by their sources

## Response format

```
## Summary
What the component does (2–3 sentences)

## How it works
Main steps/algorithm

## Dependencies
What it depends on, what it uses

## Notes
Edge cases, potential problems (if any)
```

Explain what the code does and why it is done this way; point out problems, and propose improvements only if asked.
