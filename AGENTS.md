# AGENTS.md — Agent Contract & Project Guide

## Purpose of This File

This document defines **clear rules and context for Cursor agents** working on this repository.
Its goals are:

* reduce incorrect assumptions by agents
* keep refactorings safe and focused
* clearly separate *project code* from *external dependencies*
* make diffs predictable and reviewable

Agents are expected to **follow this file as a contract**.

--- 

## Other files with rules

* AGENTS.refactor.md — Refactoring-specific rules
* AGENTS.ignore - Files to ignore for agents
* .js-rules.md — JavaScript code style and project rules

---

## Project Overview

This project is a **Google Chrome Extension (Manifest V3)** for **visual comparison of BPMN 2.0 and DMN diagrams** inside **GitLab merge requests**.

Core idea:

* detect BPMN / DMN files in GitLab MRs
* load *two versions* of a diagram
* render them side-by-side or overlayed
* visually highlight semantic differences

The extension is intended for **technical users reviewing process changes**, not for editing diagrams.

---

## High-Level Architecture

The project is intentionally small and flat.
There is **no build step** and **no framework**.

Key files:

* `main.js` — entry point, GitLab integration, UI wiring
* `bpmn-differ.js` — BPMN diff logic and rendering
* `dmn-differ.js` — DMN diff logic and rendering
* `utils.js` — shared helpers (DOM, parsing, HTTP)
* `config.js` — constants and configuration
* `styles.css` — UI styles
* `manifest.json` — Chrome extension configuration

---

## External Libraries (IMPORTANT)

The `libs/` directory contains **external libraries and vendor code**.

Rules:

* `libs/` is treated as **external API**
* **DO NOT modify** files inside `libs/`
* **DO NOT refactor or analyze internal implementation of `libs/`**
* Assume libraries behave according to their public API and documentation

The folder `libs/` is intentionally excluded via `.cursorignore`.

---

## What Agents MAY Do

Agents are allowed to:

* refactor existing project files for clarity and maintainability
* improve internal structure and naming
* reduce duplication
* simplify logic
* improve separation of concerns
* suggest small, focused improvements

All changes must:

* preserve existing behavior
* preserve public-facing UI and user flow
* keep backward compatibility

---

## What Agents MUST NOT Do

Agents must NOT:

* change extension behavior or UX without explicit request
* introduce new dependencies
* modify `manifest.json` unless explicitly instructed
* touch `libs/`
* rewrite the project architecture wholesale
* introduce build tools, bundlers, or frameworks

Large rewrites are **not allowed** unless explicitly requested.

---

## Coding Style & Constraints

* Language: **plain JavaScript (ES6+)**
* No TypeScript
* No frameworks
* Prefer small, pure functions
* Prefer readability over cleverness
* Avoid hidden side effects

Refactoring should be:

* incremental
* easy to review
* easy to revert

---

## Refactoring Guidelines (Critical)

When refactoring:

1. **One concern per change**
2. Keep diffs small and focused
3. Do not mix refactoring with feature changes
4. If unsure — explain assumptions before changing code

If behavior might change:

* stop
* explain the risk
* ask for confirmation

---

## How to Think About the Domain

* BPMN / DMN parsing and rendering is handled by external libraries
* Project logic focuses on:

  * comparison strategy
  * mapping elements between versions
  * highlighting meaningful differences

Agents should focus on:

* clarity of comparison logic
* robustness of edge cases
* readability for future maintainers

---

## Default Assumptions for Agents

Unless explicitly stated otherwise:

* Read-only behavior is intended
* Performance is "good enough" for MR-sized diagrams
* Simplicity > abstraction

---

## Agent Communication Rules

Agents should:

* explain *why* a refactor is proposed
* describe trade-offs
* avoid overengineering
* ask before making structural changes
