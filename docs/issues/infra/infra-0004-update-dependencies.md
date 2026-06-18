---
id: INFRA-0004
title: Regular updates of dependency versions
priority: low
status: open
---

## Statement

Keep the versions of external libraries up to date: periodically update `bpmn-js`, `dmn-js`, the properties panel, and other dependencies to fresh releases (bug fixes, security, new features). Versions are set in `package.json`, files in `libs/` are rebuilt by `npm run sync:libs` (do not edit `libs/` manually).

## Context

- Dependency versions are in `package.json`; after a bump — `npm run sync:libs`, then `npm test` and manual verification of BPMN and DMN diff (see `docs/testing.md`).
- When updating, check the upstream changelog for bugs already fixed in the project — for example, Ctrl+F interception in bpmn-js ([BUG-0007], bpmn-io/bpmn-js#1888).
- Related to [INFRA-0001] (mechanism for pulling in libraries and switching to minified builds) and [INFRA-0003] (automatic checks): version updates are convenient to tie together with this work.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
