---
id: FEAT-0038
title: Camunda 8 (Zeebe) support
priority: high
status: done
---

## Statement

Everything the extension does for Camunda 7 diagrams it must do for diagrams of projects
already on **Camunda 8 (Zeebe)**: the properties panel, the per-group change highlighting,
the condition diff, dive-in / dive-out across call activities and business rule tasks, and
the handler badges. The users this serves work on projects that are all-C7 or all-C8, not a
mix.

A merge request that migrates a diagram from 7 to 8 is a bonus, not a goal: it must open
and highlight changes on both sides without errors; panel and navigation are allowed to
work on the Camunda 8 side only (see "Design decisions").

Three stages, implemented in order on **one branch and one PR**, at least one commit per stage
(each stage leaves `npm test` green on its own):

1. **Diff parity** — Zeebe moddle and properties panel, the comparator's `zeebe:*` groups,
   FEEL conditions.
2. **Navigation** — dive-in / dive-out through `zeebe:calledElement` / `zeebe:calledDecision`.
3. **Handlers** — badges from `zeebe:taskDefinition`, `@JobWorker` in the code, the popup.

## Context

### Current behaviour on Camunda 8 (measured 2026-10-10 on the sandbox material)

Comparator through `#scope`, the real differ through Playwright, on `order-service-c8/`
(`main` vs `c8/model-changes`):

| Works today | Broken today |
|---|---|
| Rendering; added / removed / changed shapes; a change inside a collapsed subprocess (`subProcessWithChangesIds`); type change; the Message group (the `zeebe:subscription` change surfaces at the referencing receive task) | The panel is the Camunda 7 one: no `zeebe:*` field is visible, Inputs/Outputs are empty |
| The message-correlation badge (`newPublishMessageCommand` / `newCorrelateMessageCommand` / `messageName` are already recognised) | The comparator logs `property group not found for diff: zeebe:…` for every Zeebe change, so no panel group lights up |
| | No handler badges (`HandlerLocator.handlerKeyFromBusinessObject` reads only `camunda:*`) |
| | No dive-in on a call activity / business rule task: `bo.calledElement` / `bo.decisionRef` are empty in C8 |
| | A FEEL condition (`=a and b or c`) is collapsed to one line by `ConditionFormatter` (it splits on `&&`/`||` only), so the line-by-line condition diff degrades |

### Test material (already in place)

The sandboxes `gitlab.com/kao.alllex/bpmn-surf-test` and `github.com/kaoalllex/bpmn-surf-test`
gained, on 2026-10-10, the module `order-service-c8/` — the Camunda 8 twin of
`order-service/` — and three branches with an open MR / PR each:

| Branch | GitLab | GitHub | What it exercises |
|---|---|---|---|
| `c8/model-changes` | !18 | #17 | every `zeebe:*` group changed (job type retries, I/O mapping, headers, execution listener, call activity propagation + output, message correlation key, multi-line FEEL condition, version tag, multi-instance input collection, user task form / assignment / priority, a service task turned into a user task, a change inside the collapsed "Prepare the documents", script, connector URL, DMN rule) |
| `c8/worker-code` | !19 | #18 | worker code only (`FindItemsWorker.kt`, `ChargeCustomerWorker.java`) — the "changed handler" badge |
| `c8/migrate-payment` | !20 | #19 | the C7 `order-service/.../payment/Payment.bpmn` migrated in place to C8 — the 7-vs-8 bonus |

Ids a search keys on (process, decision, message) carry a `C8` suffix, so the C7 and C8
modules never answer each other's searches. The module README lists the traps; the main
ones: kebab-case job-type prefixes (`find-items` / `find-items-in-catalog`,
`charge-customer` / `charge-customer-with-retry`), `@JobWorker` without `type`
(`screenFraud`, `packItem`), `type` not the first argument (`reserve-stock`), a multi-line
annotation, `@ZeebeWorker` (`escalate-delivery`), no worker (`archive-delivery`), an HTTP
connector (`io.camunda:http-json:1`), a job type on a message throw event
(`PublishCompleted`), `DunningC8` called but defined nowhere. All diagrams import into
`bpmn-moddle` + `zeebe.json` with 0 warnings and no unknown `zeebe:*` attribute.

### Design decisions

1. **One dialect per differ tab, strictly.** `camunda-bpmn-moddle` and `zeebe-bpmn-moddle`
   **cannot be registered together**: both extend the same BPMN types with
   `modelerTemplate`, and moddle then rejects every `bpmn:process`
   (`property <modelerTemplate> already defined; override of
   <camunda:TemplateSupported#camunda:modelerTemplate> by
   <zeebe:TemplateSupported#zeebe:modelerTemplate> not allowed without redefines` — 17–72
   import warnings on every sandbox diagram, C7 and C8 alike). With one descriptor the
   other dialect's attributes simply stay raw (`$attrs`), 0 warnings. So the differ picks
   one dialect — **C8 if either loaded version is C8, else C7** — and registers that one
   descriptor and that one properties provider. Every dialect-dependent decision below
   (accessors, search terms, handler keys) uses this one value. Patching `camunda.json` in
   memory to make both coexist was rejected: a live edit of a library descriptor for a
   bonus scenario, with unclear effects on the panel and edit mode.
2. **Consequence for a 7-vs-8 diff:** the comparator works on the XML DOM, not on moddle,
   so highlighting works on both sides; the panel and the navigation (dive-in/out, badges)
   work only on the side of the differ's dialect (the C8 side), and silently do nothing on
   the other.
3. **Dialect detection** is a pure function of the XML: `'c8'` when the document declares
   the namespace `http://camunda.org/schema/zeebe/1.0` or carries
   `modeler:executionPlatform="Camunda Cloud"`, `'c7'` otherwise (so plain BPMN keeps
   today's behaviour). The same function serves DMN (a C8 DMN from Camunda Modeler always
   carries `executionPlatform="Camunda Cloud"`).
4. **Handler keys stay one namespace, `topic:<string>`,** for a C7 topic and a C8 job type
   alike; no per-dialect tagging of annotations — projects are homogeneous.
5. **One annotation list** ("Topic in the annotation"), default
   `['ExternalTaskSubscription', 'JobWorker']`, every name removable, any name addable
   (e.g. `ZeebeWorker`). A user who already saved a custom list keeps it untouched (they add
   `JobWorker` themselves); a fresh install and a user who never edited the list get the new
   default through `normalizeHandlerAnnotations`. Sites stay empty on a fresh install, as
   today.
6. **The popup stays minimal**: no new lists or toggles. The add fields for annotations and
   for sites get suggestions through a native `<input list>` + `<datalist>` (one field:
   known values offered, free text still accepted).
7. `zeebe-bpmn-moddle` becomes an explicit **dev dependency** (agreed 2026-10-10), synced
   into `libs/` like `camunda-bpmn-moddle`.

### Stage 1 — diff parity

**Library.**
- `package.json#devDependencies`: `zeebe-bpmn-moddle`, pinned to the version the panel stack
  already resolves (`npm ls zeebe-bpmn-moddle` → 1.14.0 via `bpmn-js-element-templates` →
  `camunda-bpmn-js-behaviors` on 2026-10-10; npm `latest` is 2.x — do not jump majors
  separately from the panel).
- `scripts/sync-libs.js`: `{ package: 'zeebe-bpmn-moddle', from: '', files: ['resources/zeebe.json'] }`
  (≈14 KB); `manifest.json#web_accessible_resources`: `libs/zeebe-bpmn-moddle/resources/zeebe.json`.

**Params.**
- `CamundaBpmnModdleManager` takes the descriptor path; `App` keeps two instances (the
  content script cannot know the dialect — it never reads the XML) and warms both in
  `#resolveChangeView`.
- `DiffParamsBuilder` (both builders) and the two places in `App` that pass
  `camundaBpmnModdle` to it: new field `zeebeBpmnModdle` next to it.
- `DifferParams`: carry it like `camundaBpmnModdle` (constructor and both nested-params
  builders). `ConsoleLog.describeDifferParams` is a whitelist, so it stays out of the log —
  keep it that way.
- `test/e2e/support/boot-differ.js#defaultBpmnParams`: add `zeebeBpmnModdle`.

**Dialect.** New `src/differ/shared/camunda-dialect.js`: `detectCamundaDialect(xml)`
(decision 3), the dialect-agnostic name for the result (`'c7' | 'c8'`), and the stage-2
accessors. Register the file in `manifest.json#web_accessible_resources`,
`utils.js#loadScripts` and `test/support/scope.js#SCOPE_FILES` (differ-only, not in
`content-scripts.json`); `test/structure/registries.test.js` guards the sync.

**Init order in `BpmnDiffer.show()`.** Today `#createModeler()` runs before
`#loadVersions()`. Load the versions first, detect the dialect from the loaded XML
(source, target, or the local file), then create the modeler:
- C8 → `ZeebePropertiesProviderModule` + `moddleExtensions: { zeebe }`;
- C7 → `CamundaPlatformPropertiesProviderModule` + `moddleExtensions: { camunda }` (today).

Everything wired off `#bpmnJS` in `show()` moves after it. If loading fails, the error path
behaves exactly as today with the C7 default. Edit mode uses the same modeler, so editing a
C8 diagram goes through the Zeebe panel; check that an exported C8 XML keeps the `zeebe`
namespace and its extension elements. Store the dialect on the differ for stages 2–3.

**Comparator (`bpmn-xml-comparator.js`).** One shared table, no dialect switch — `camunda:`
and `zeebe:` keys never collide. Group labels below were read off the real Zeebe panel
(`bpmn-js-properties-panel` 5.65.1, script in `cws-media/sandbox-c8-generator/zeebe-panel.cjs`)
for the sandbox elements; the e2e test is the source of truth if a later panel renames one.

| Diff (tag or tag/attribute) | Zeebe panel group |
|---|---|
| `zeebe:taskDefinition` (`type`, `retries`) | Task definition |
| `zeebe:jobPriorityDefinition` | Job priority |
| `zeebe:ioMapping`, `zeebe:input` (+ `/source`, `/target`) | Input mapping |
| `zeebe:output` (+ `/source`, `/target`) | Output mapping |
| `zeebe:taskHeaders`, `zeebe:header` | Headers |
| `zeebe:properties`, `zeebe:property` | Extension properties |
| `zeebe:calledElement` (`processId`, `bindingType`, `versionTag`) | Called element |
| `zeebe:calledElement/propagateAllParentVariables` | Input propagation |
| `zeebe:calledElement/propagateAllChildVariables` | Output propagation |
| `zeebe:calledDecision` (`decisionId`, `bindingType`, `resultVariable`) | Called decision |
| `zeebe:script` (`expression`, `resultVariable`) | Script |
| `zeebe:loopCharacteristics` (`inputCollection`, `inputElement`, `outputCollection`, `outputElement`) | Multi-instance |
| `zeebe:userTask` (presence: Camunda user task vs job worker) | Implementation |
| `zeebe:assignmentDefinition`, `zeebe:taskSchedule`, `zeebe:priorityDefinition` | Assignment (the panel shows due/follow-up date and priority there) |
| `zeebe:formDefinition`, `zeebe:userTaskForm` | Form |
| `zeebe:executionListeners`, `zeebe:executionListener` | Execution listeners |
| `zeebe:taskListeners`, `zeebe:taskListener` | Task listeners |
| `zeebe:modelerTemplate`, `zeebe:modelerTemplateVersion`, `zeebe:modelerTemplateIcon` (attributes on the element) | `_header_` (no group; the element template module is not loaded) |
| `zeebe:versionTag` (on `bpmn:process`) | — not an element; not highlighted, as for C7 |

- `#LIST_GROUP_CONFIG`: `zeebe:input` and `zeebe:output` keyed by `target` (parent
  `zeebe:ioMapping`), `zeebe:header` by `key` (parent `zeebe:taskHeaders`), `zeebe:property`
  by `name` (parent `zeebe:properties`). Confirm in the panel which attribute is the list
  item's header text before relying on it.
- `#ATTRIBUTE_DEFAULTS`: the `zeebe.json` defaults — `propagateAllParentVariables="true"`,
  `bindingType="latest"`; check how the map is keyed (bare `isInterrupting` vs prefixed
  `camunda:asyncBefore`) — Zeebe attributes sit unprefixed on `zeebe:` elements. `retries`
  has no moddle default (the engine's is 3; Camunda Modeler writes `retries="3"`): treat
  absent as `"3"` only if it does not mask a real change in the tests.
- `#isEmptyExtension`: accept the `zeebe:` prefix as well (the panel leaves empty
  `zeebe:ioMapping` / `zeebe:taskHeaders` / `zeebe:properties` behind, like the C7 ones).
- `#nodeToDiffs`: descend into the containers `zeebe:ioMapping`, `zeebe:taskHeaders`,
  `zeebe:properties`, `zeebe:executionListeners`, `zeebe:taskListeners` like
  `camunda:inputOutput`.

**`properties-group-expander.js`.** `#addNonEmptyListGroups`: `zeebe:IoMapping` →
"Input mapping" / "Output mapping" when its inputs / outputs are non-empty;
`zeebe:TaskHeaders` → "Headers"; `zeebe:Properties` → "Extension properties". Check the
expander's other group names against the Zeebe panel too.

**FEEL conditions.** `ConditionFormatter.format`: a condition starting with `=` is FEEL —
split on the words `and` / `or` outside string literals the way `&&` / `||` are split
today, keep the leading `=`, treat `not(` as a function call. JUEL output stays
byte-identical (the existing tests guard it).

**Shared-class rule:** the comparator and the expander are BPMN-only; `ConditionFormatter`
too. No DMN differ change in stage 1.

**Tests (stage 1).**
- Unit: `detectCamundaDialect` (namespace only, `executionPlatform` only, both, neither, DMN);
  a new `bpmn-xml-comparator-zeebe.test.js` on a new `test/fixtures/zeebe-base.bpmn`, one
  change per test by string replacement, the way `bpmn-xml-comparator-camunda.test.js`
  works — one test per row of the table, the list-group cases, the defaults, the empty
  containers; FEEL cases in `condition-formatter` tests.
- e2e: a DI-bearing C8 fixture pair cut from the sandbox (`main` vs `c8/model-changes`) —
  the Zeebe panel is shown, the right group is highlighted for each change kind, the FEEL
  condition is split; a 7-vs-8 pair opens without page errors and with the Zeebe panel;
  edit mode on a C8 diagram (the prop-group marker, download keeps `zeebe:`).
- Every existing test stays green without edits, except those that test the init order
  itself.

**Live check (stage 1).** !18 / #17: Zeebe panel, a highlighted group for every change in
the table above, FEEL condition split into lines, the collapsed subprocess marked, edit
mode on `OrderMain.bpmn`. !20 / #19: opens without errors, Zeebe panel on both sides,
highlighting on both sides. Any C7 MR of the sandbox looks exactly as before.

### Stage 2 — navigation

**Accessors** in `camunda-dialect.js`, explicit dialect, no fallback chains:
`calledProcessId(bo, dialect)` — C7 `bo.calledElement`, C8 the `processId` of the
`zeebe:CalledElement` in `bo.extensionElements.values`; `calledDecisionId(bo, dialect)` —
C7 `bo.decisionRef`, C8 the `decisionId` of `zeebe:CalledDecision`.

Callers: `CallActivityNavigator#getCalledElement`, `DecisionNavigator#getDecisionRef`,
`BpmnDiffer#applyInitialCallActivitySelection` (the dive-out call-site auto-select). They
get the differ's dialect (constructor argument or a getter — follow how they already get
the ref).

A FEEL expression in place of an id (`processId="=subProcessVar"`) is not searchable:
treat it like today's `${…}` — go straight to the code-search page.

**Forward search** is unchanged: `<bpmn:process id="X"` and `decision id="X"` read the same
in both dialects (`CallActivityLocator`, `DecisionLocator`, the `ProcessFileIndex` fallback).

**Reverse search** depends on the dialect:
- `CallerLocator`: C7 `calledElement="X"`, C8 `processId="X"` — both in `resolveCallers`
  and in `blobSearchPageUrl`;
- `DecisionCallerLocator`: C7 `decisionRef="X"`, C8 `decisionId="X"` — same two places.
  In the DMN differ the dialect comes from `detectCamundaDialect` on the loaded DMN XML.

**Message correlation** needs no change; add a C8 regression e2e only.

**Tests (stage 2).** Unit: both accessors per dialect, a FEEL id, an element of the other
dialect (→ null); the search terms of both caller locators per dialect. e2e: dive-in from a
C8 call activity and from a C8 business rule task; the dive-out menu on a C8 BPMN and from a
C8 DMN; the call-site auto-select; the correlation badge on a C8 receive task.

**Live check (stage 2).** On `main` of the C8 module: OrderMain → Payment → `PaymentC8`,
AssessRisk → `PaymentRiskC8.dmn`; dive-out from Delivery to Fulfillment and from
`PaymentRiskC8.dmn` to Payment; Dunning (`DunningC8`) opens the code-search page; on !20
dive-in works on the C8 side.

### Stage 3 — handlers

**Key from the diagram.** `HandlerLocator.handlerKeyFromBusinessObject(bo, dialect)`:
- C7 — unchanged;
- C8 — the `zeebe:TaskDefinition` in the element's **own** `extensionElements` (also on a
  message throw / end event: in C8 the job type sits on the event, not on its
  `messageEventDefinition`; also a script or business rule task implemented as a job
  worker) → `topic:<type>`;
- no key (→ no badge) when the type starts with `io.camunda:` (Camunda's out-of-the-box
  connectors, no project code) or is a FEEL expression (`=…`).

`HandlerNavigator#getHandlerKey` passes the differ's dialect.

**Annotations in the code.** One rule for every name in the configured topic list (decision
5); `HandlerLocator.extractSubscriptionTopics` and the search's "annotated" filter use it:
- the topic / type is a string literal that is either positional or named `type`, `value`
  or `topicName`, **at any position** in the argument list, the annotation possibly spanning
  several lines; other named strings are ignored (`@JobWorker(name = "w1", type = "x")` →
  `x`, never `w1`);
- no such string and the next declaration is a method (Kotlin `fun name(`, Java
  `… name(`) → the method name (`@JobWorker fun screenFraud(` → `screenFraud`;
  `@JobWorker(autoComplete = true) fun packItem(` → `packItem`);
- no string and a class follows → nothing (today's behaviour for a class-level
  subscription without a topic);
- `@ExternalTaskSubscription("x")` keeps yielding exactly what it yields today.

**Exact match (BUG-0027 for kebab-case).** `HandlerLocator.matchesExactTopic` uses
`\b…\b`, and `-` is a word boundary, so `find-items` "exactly" matches inside
`"find-items-in-catalog"`. Job types are kebab- or dot-separated: the unquoted branch must
not count `-` or `.` as a boundary (e.g. `(?<![\w.-])…(?![\w.-])`). A method-name type is
matched as a method declaration (`fun screenFraud(` / `screenFraud(`). `#computeMatchLine`
must land on the annotation line, or on the method line for a method-name type.

**Defaults and popup.**
- `DEFAULT_HANDLER_ANNOTATIONS.topic`: `['ExternalTaskSubscription', 'JobWorker']`; update
  the header comment of `handler-annotations.js`.
- Popup, "Topic in the annotation" block: title "Topic / job type in the annotation"; two
  examples (`@ExternalTaskSubscription("validateOrder")`,
  `@JobWorker(type = "validate-order")`) and "no type → the method name"; the empty-lists
  warning loses the words "external tasks".
- `<datalist>` suggestions, minus the names already in the list: the topic annotation input
  → `ExternalTaskSubscription`, `JobWorker`, `ZeebeWorker`; the class-name input — none
  (no known names); the site input → `gitlab.com`, `github.com`.
- Settings export / import: no format change (the list is the same list).

**Tests (stage 3).** Unit: the extraction rules above one by one, incl. `name = "…"`
ignored, multi-line, Kotlin and Java method names, `@ZeebeWorker` with and without being
configured, the kebab-case prefix traps in `matchesExactTopic`, `@ExternalTaskSubscription`
regressions; the key from a BO — service task, message throw event, connector, FEEL type,
C7 element under the C8 dialect and vice versa (→ null); `normalizeHandlerAnnotations` —
nothing stored → the two-name default, a stored list → unchanged. e2e: the neutral badge on
a C8 task; the "changed" badge from a changed worker file (as in !19); no badge on the
connector; the popup datalist.

**Live check (stage 3).** On the C8 module: badges on every task with a worker, including
`screenFraud` / `packItem` (method name), `reserve-stock` (type not first),
`find-items-in-catalog` (multi-line) and the Java ones; `find-items` and `charge-customer`
open their own workers, not the longer-named ones; `archive-delivery` opens the
code-search page; the connector has no badge; `escalate-delivery` opens its worker (the
neutral badge is on every task with a job type, and a hit annotated by no configured name is
still taken when no hit is — as for C7; `ZeebeWorker` in the popup matters for the "changed"
badge, which scans the changed files); `find-items` and `charge-customer` yield their keys
from the !19 / #18 worker files (that MR carries no diagram, so the "changed" badge itself is
checked in Layer 2). C7 handler badges on `order-service/` unchanged.

### Out of scope / known limitations

- Listener badges (`zeebe:executionListener` / `zeebe:taskListener` job types) — in
  [FEAT-0019], for both dialects, after stage 3.
- Job types overridden in configuration (`camunda.client.worker.override.<name>.type`,
  `…defaults.type` in `application.yml`): the badge then opens the code-search page.
- Panel and navigation on the C7 side of a 7-vs-8 diff (decision 2).
- Process-level changes (`zeebe:versionTag`), opening linked `.form` files — not done for
  C7 either.

### Documentation per stage

`docs/architecture.md` (stage 1: `camunda-dialect.js` in the tree and the key-files table,
the descriptors, the "versions → dialect → modeler" order; stage 2: dialect-dependent
search terms; stage 3: the C8 handler key and the annotation rule), `docs/testing.md` (the
C8 module in the sandboxes, the C8 fixtures), `README.md` (Camunda 8 support line, stage 1;
`@JobWorker`, stage 3), `CHANGELOG.md` per stage. Local, not in git: the `live-check` skill
(the C8 scenarios into the release smoke). The store texts are updated with the 1.4.0
release (INFRA-0012).

### Links

- [FEAT-0019] — listener badges, extended with the Camunda 8 part; follows stage 3.
- [FEAT-0035] — the configurable handler annotations this extends.
- [FEAT-0027] — message correlation (already C8-aware).
- [FEAT-0023], [FEAT-0005] — dive-out, the caller locators.
- [BUG-0027], [BUG-0028] — exact topic match; the kebab-case gap above.
- Local: the sandbox generator and the probe scripts — `cws-media/sandbox-c8-generator/`.

## Work log

<!-- Each AI session on the task — a separate entry by the template in docs/issues/README.md.
     Add new entries on top (freshest first). -->

### 2026-10-10 · claude-opus-5-5 · `e1b8b43` (branch `feature/feat-0038-camunda-8`)

All three stages, one commit each (`0da8740`, `2bb1dee`, `090c798`), plus two fixes the live
check found (`e0d753e`, `e1b8b43`).

- Stage 1: `src/differ/shared/camunda-dialect.js` (`detectCamundaDialect`, `isFeelExpression`);
  `BpmnDiffer.show()` loads the versions, decides the dialect, then builds the modeler with one
  descriptor + provider; both descriptors ride in the params (`zeebeBpmnModdle`). Comparator:
  the `zeebe:*` rows, Zeebe list groups (Input/Output mapping by `target`, Headers by `key`,
  Extension properties by `name`), the defaults (`propagateAllParentVariables`, `bindingType`,
  `retries="3"`), `zeebe:` empty containers ignored except `zeebe:userTask`. The expander takes
  the dialect (service task → "Task definition", user task → "Form"). FEEL conditions split on
  `and`/`or`; the highlighter reads a FEEL editor (no `.value`).
- `zeebe-bpmn-moddle` is pinned to **2.0.0**, not 1.14.0: the panel (5.65.1) is built against
  ^2.0.0 and writes `zeebe:JobPriorityDefinition`, absent in 1.14; 2.0.0's `zeebe.json` is
  byte-identical to 1.18.0 (the major is packaging only).
- Stage 2: `calledProcessId` / `calledDecisionId`; navigators, the call-site auto-select and both
  caller locators read the dialect through a getter (`processId=` / `decisionId=` under C8); a
  FEEL id goes straight to the search page.
- Stage 3: `handlerKeyFromBusinessObject(bo, dialect)` (job type, no key for `io.camunda:` or
  FEEL); one annotation parser for every topic name (type at any position, method name without
  one, nothing for a constant or a class); `matchesExactTopic` keeps `-`/`.` inside a name;
  default list `['ExternalTaskSubscription', 'JobWorker']`; popup datalists and texts.
- Live check (GitLab !18/!20/!9, `main` of both modules; GitHub #17/#19, `main`), all scenarios
  of the three checklists passed after two fixes: every nested tab opened from a C8 differ was
  blank (the FEEL editor's inline `<style>` has a null `href`, which the tab-resource lookup
  dereferenced — pre-existing, surfaced by C8; Layer 2 stubs `openDiffer`, so it never saw it),
  and a C7 badge (`findItems`) opened the C8 `FindItemsWorker` (method `findItems` under
  `type = "find-items"`) once `JobWorker` was a default — the exact match now prefers a hit that
  declares the topic.
- After a subagent review of the branch: FEEL fields of the Zeebe panel are selectable and
  copyable in view mode (the CSS `pointer-events: none` on contenteditable is gone; their
  editing keys, paste, cut and drop are vetoed in the capture phase — CodeMirror edits from
  its own handlers, which the `beforeinput` veto does not reach); comments inside or after an
  annotation no longer hide the job type or the method; a `zeebe:` diff takes its element's
  row before a bare attribute row (`zeebe:property/name` → "Extension properties", not
  "General"); edit mode takes the dialect of the edited side only (editing the C7 side of a
  migration no longer writes `zeebe:*` into it); the highlighter and the auto-expand look the
  groups up side by side, so a group the panel lacks (a C7 change on the C8 side of a
  migration) no longer delays the others by ~1.35 s each (live, !20: 3 s → 146 ms).
- After the human's own check: the differ tab rendered in quirks mode (an `about:blank`), so the
  FEEL fields of the Zeebe panel stretched to the window height (CodeMirror's `min-height: 100%`)
  — `openDiffer` now writes a doctype (standards mode, like the Layer-2 harness, which is why no
  spec saw it); the panel's FEEL pop-up editor opened under the differ's fixed full-page layout
  (z-index 1001 vs 9999) — raised above it; an outdated highlight run (a group lookup still
  retrying when the shown side changes) painted the other side's list entries into the new panel
  and warned `list item "paymentId" not found` — runs are now numbered and an outdated one stops,
  and a run that found the group in the panel still showing the previous side stays quiet when the
  re-render drops that group;
  the panel's own condition field flashed (with its syntax colours) on every selection or Switch
  branch until the injected formatted condition hid it — a CSS rule now hides it from the start
  (C7 as well, where the flash was older).
  Also closed the review's minors: `between … and …` and a path segment `.or` no longer split a
  FEEL condition; `@ExternalTaskSubscription` takes no method-name default; a configured name no
  longer matches inside a longer one (`@ZeebeJobWorker`); params without the Zeebe descriptor (a
  tab opened from an older differ) show a C8 diagram as C7 instead of failing.
- `CHANGELOG.md` is left to the release.
- Tests: unit 1625, Layer 2 205 (new: `differ-c8-*`, `differ-highlight-stale-run`, `differ-condition-no-flash`, `popup-datalist`).
