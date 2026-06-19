---
id: FEAT-0005
title: Navigate to the called DMN
priority: medium
status: done
---

## Statement

By analogy with "drilling down" into a CallActivity — open in a separate tab the DMN called from a `Business rule task`.

## Context

- **Gates the `bpmn-surf` rename** ([UX-0009]), together with [FEAT-0023]: the
  rename commit lands only after cross-schema navigation (BPMN → called DMN, and
  back) is real. Part of the browsing-first shift the rebrand reflects.

## Design (agreed)

Full mirror of the Call Activity dive-in ([FEAT-0023]), both directions:

- **Down (BPMN → DMN).** A new `DecisionNavigator` shows the `⤵` overlay on a
  selected `bpmn:BusinessRuleTask` with a `camunda:decisionRef`; a new
  `DecisionLocator` resolves the `.dmn` file by a targeted blob-search for
  `decision id="<decisionRef>"` (mirror of `CallActivityLocator`, no
  `ProcessFileIndex` fallback), and the DMN differ is opened by posting with
  `DmnDiffer.MSG_ID` (both differ scripts already load in every differ tab).
  Kept as **separate** classes, like the existing `CallActivityNavigator` /
  `HandlerNavigator` siblings (not generalized).
- **Up (DMN → BPMN).** The DMN differ gets the full `BackNavigator` (the
  [FEAT-0023] control, already generic — its DMN direction was deferred there).
  A new `DecisionCallerLocator` (mirror of `CallerLocator`) finds the BPMN files
  that call this decision via `decisionRef="<id>"`. Opening such a caller passes
  `selectCalledProcessIds = <decision ids>`; the BPMN side's initial-selection
  matcher is broadened to also select a `bpmn:BusinessRuleTask` by `decisionRef`
  (process and decision id namespaces do not collide, so the param is reused).
- **Shared.** The opener-tab logic (focus-opener-and-close, open-nested-differ,
  resource-href lookup), today private and identical in `BpmnDiffer`, is
  extracted into a shared `DifferTabNavigator` used by both orchestrators.

Known limitations (out of scope here): a `decisionRef` expression (`${…}`) is
not blob-searchable → falls back to the GitLab search link (as for Call
Activity); a `.dmn` with multiple decisions opens the file, but the DMN differ
still shows only the first decision (existing `DmnXmlComparator` behavior).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries at the top (most recent first). -->

### 2026-06-19 · claude-opus-4-8 · branch `feature/feat-0005-navigate-called-dmn`

Implemented the full mirror of the Call Activity dive-in ([FEAT-0023]), both
directions, per the agreed design.

- **Down (BPMN → DMN).** New `DecisionLocator` (mirror of `CallActivityLocator`,
  no `ProcessFileIndex` fallback) resolves a `decisionRef` → the `.dmn` declaring
  it via blob-search `decision id="..."`. New `DecisionNavigator` (mirror of
  `CallActivityNavigator`) shows the `⤵` overlay on a selected
  `bpmn:BusinessRuleTask` with a `decisionRef` and opens the DMN differ.
- **Up (DMN → BPMN).** `DmnDiffer`/`DmnDifferView` now mount the generic
  `BackNavigator`; new `DecisionCallerLocator` (mirror of `CallerLocator`) finds
  the BPMN files calling this decision via `decisionRef="<id>"`. Stepping up passes
  `selectCalledProcessIds=<decision ids>`; the BPMN initial-selection matcher was
  broadened to also select a `bpmn:BusinessRuleTask` by `decisionRef`.
- **Shared.** Extracted the opener-tab logic (focus-opener-and-close,
  open-nested-differ with differ-kind-by-extension, resource-href lookup,
  navigate-opener-tab) from `BpmnDiffer` into a shared `DifferTabNavigator` used by
  both orchestrators.

Key files: `decision-locator.js`, `decision-navigator.js`,
`decision-caller-locator.js`, `shared/differ-tab-navigator.js` (new);
`bpmn-differ.js`, `dmn-differ.js`, `dmn-differ-view.js`, `differ-params.js` (wiring);
4 registries + docs/architecture.md updated. Unit tests added for the two new
locators (28 new); `npm test` green (867). Manual in-browser check on a real MR with
a Business Rule Task → DMN still recommended (`/verify`).
