---
id: FEAT-0022
title: Configurable schema validator with violation highlighting (local + REST delegation)
priority: low
status: open
---

## Statement

A built-in **schema validator** that checks BPMN/DMN against **dynamically
configurable rules** and **highlights violations** directly in the viewer.

Requirements:

1. **The rule set is user-configurable**: enable/disable,
   add new ones, remove. There is a **default set** that can be
   **reset** to (reset).
2. **Local execution** of the rules — we check the schema "in place" in the extension.
3. **Validation delegation**: some rules are computed not locally but by calling an
   external **validation service over a REST API**. The architecture is built for delegation
   from the start, but the **REST provider is phase 2** (v1 — local rules only).
4. **Violation highlighting** on the schema + a list of findings (by analogy with the diff).

This task **replaces** [IDEA-0001] (the "BPMN schema validation" stub) — that one is closed
as absorbed.

## Context

### As an analyzer of the review findings core ([FEAT-0040])

The validator becomes a synchronous analyzer of [FEAT-0040]: its violations are findings,
its rules a "Modelling rules" section of the same profile tree (on/off, level, reset,
export/import), and its rules share the element selector and value tests with
[FEAT-0042] (FEAT-0042 rules describe a *change*, these describe a *state*). Requirements
added by that design:

- **A single diagram first**: list the violations of the shown process/decision table.
  Then, in a merge request diff, split them into **new** (head only), **fixed** (base only)
  and **existing** (both): new ones shown like flags, fixed ones listed, existing ones hidden
  behind a toggle. The classification is base→head, independent of the side on screen.
- **Violation identity**: rule id + owner element id (+ entry key for entry-level rules) —
  not the rendered message. A changed element id is fixed + new. A load failure or an
  unsupported baseline is not an empty model.
- **Default rules** are a small named list, each with dialect, scope, level, enabled state
  and a passing and a failing example. Team conventions (e.g. "service tasks run with
  asynchronous continuations before and after", "user tasks have a candidate group" —
  direct assignment is equally valid) ship as **opt-in examples**, not as defaults. A DMN
  example: "every input column has a non-blank label", off by default.
- **Local by default**: the REST delegation of phase 2 is opt-in, off by default, limited to
  a host the user configures, and the UI states that the diagram is sent there.
- **Edit mode**: say whether validation follows the live edits or the opened snapshot.
- Reading a repository's `.bpmnlintrc` to mirror bpmnlint's built-in rules is a separate
  decision (bpmnlint's custom rules are JavaScript and cannot be loaded); results of bpmnlint
  run in CI can arrive through [IDEA-0006] instead.

### Phases

- **v1 (this task, local):** the rules engine, a default set of local rules,
  editing the set (enable/disable/add/remove) + reset to default, highlighting
  and a list of violations. Design the rule-provider interface so that the source
  of the result (local/remote) is abstracted.
- **Phase 2 (separately):** the REST provider — delegating some rules to an external
  validation service (see open questions).

### What is reused

- **Highlighting**: `src/differ/bpmn/diff-highlighter.js` — overlay markers and
  shape tinting (including TextAnnotation); the same mechanism fits violation markers
  (its own color/icon per severity).
- **List**: `src/differ/bpmn/changes-table-view.js` — a list pattern with
  click-navigation to the element; a similar list of violations in the footer.
- **Model traversal**: `element-registry`, `ElementSearcher` — access to
  elements' `businessObject` for local rule predicates.

### Open questions (to resolve during the work)

- **Storage / rule-editing UI** — NOT decided. Options: (a) a separate
  options page of the extension + `chrome.storage` (a full-fledged UI, but there is no page
  at the moment); (b) a JSON config with import/export. Fix the choice during the work.
- **Rule model**: structure (id, title, severity error/warn/info,
  predicate over the moddle model, scope — element vs the whole schema), how a
  "user-added" rule is described (a declarative JSON predicate vs a function).
- **REST contract (phase 2)**: request/response format, which version/ref we validate
  (target / source / both), timeout and fallback when the service is unavailable, authentication.
- ⚠️ **host_permissions**: the validation service URL is **configurable**, do not hardcode an
  internal domain — the repository is public, so no internal host may be baked into it.
- **What we validate**: a single version (the one open) or both diff versions; show
  "new violations that appeared in the MR" separately?
- **DMN**: whether to apply the validator to DMN or BPMN only at the start.

### Project constraints

- Vanilla JS only, no new runtime dependencies; REST — via `fetch`.
- The "local MCP only" rule applies to Claude's MCP servers, **not** to the extension's own
  REST calls — delegating validation to REST is allowed.

### Tests

- The rules engine: applying a set to a mock model, severity aggregation, enabling/disabling
  rules, reset to default, adding/removing a user rule.
- Pure predicates of the default rules — individually on plain moddle mocks.

### Links

- [IDEA-0001] — absorbed by this task (closed).

### Affected files (expected)

- a new rules-engine module + default rules (e.g. `src/differ/validation/`).
- highlighting integration (reuse `diff-highlighter.js`) and the list
  (the `changes-table-view.js` pattern).
- configuration storage (chrome.storage) + an editing UI (per the chosen option).
- `manifest.json` — `host_permissions` for the REST endpoint (phase 2).
- shared differ-page classes → check BPMN and DMN.

## Work log

<!-- Each AI session on the task is a separate entry per the template below.
     Add new entries at the top (freshest first). -->
