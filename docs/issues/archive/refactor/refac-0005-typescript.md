---
id: REFAC-0005
title: '⚠️ Migrate the project to TypeScript'
priority: low
status: done
---

## Statement

Migrate the project to TypeScript: type the models/services to reduce errors during refactoring.

## Context

- Conflicts with the current project constraint (vanilla JS only, no build step). Requires a separate architectural decision.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-10-08 · claude-opus-5-5 · branch `feature/backlog-reprioritization`

Closed without implementation: TypeScript needs a build step, which the project rules out (vanilla JS, no bundler). Reopen only together with a decision to add one.
