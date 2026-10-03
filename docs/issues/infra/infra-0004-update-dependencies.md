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

### 2026-10-03 · claude-opus-5-5 · branch `fix/update-libs`

Bumped every vendored library to its latest release: bpmn-js 18.31.0, dmn-js 17.12.2,
bpmn-js-properties-panel 5.65.1, @bpmn-io/properties-panel 3.56.1,
bpmn-js-element-templates 2.37.1, camunda-bpmn-moddle 8.0.2 (its 8.0 break — no
extensionless imports — does not touch us: only `resources/camunda.json` is vendored,
and it is unchanged). The `ContextPad#getPad is deprecated … diagram-js/pull/888`
warning survives the update: bpmn-js's own `ContextPadProvider` (replace menu) and
`AlignElementsContextPadProvider`, and dmn-js-drd's `ContextPadProvider`, still call
it — recheck on the next bump.
