---
id: FEAT-0040
title: Review findings — change levels, risk flags and a configurable rule profile
priority: high
status: open
---

## Statement

Today every change in a diff looks equally important: a renamed task is painted the same
blue as a changed gateway condition, a layout-only merge request shows an empty diff with no
explanation, and nothing says *why* a change may matter for how the process runs. Users
asked for two things: tell presentation changes from the ones that matter, and point at
changes that may affect behaviour — while keeping everything local in the browser.

This task introduces one mechanism for both, modelled on the code inspections of an IDE:

- **Analyzers** look at the two versions and produce **findings**. The XML diff is the first
  analyzer; the existing "handler changed in this MR" badge becomes the second.
- **Rules** turn changes into findings with a **level** and a **reason**. Rules are data,
  grouped (Routing, Integrations, Labels & documentation, DMN…), and each can be switched off
  or given another level in the settings — the **profile**.
- The **level** decides how a change is shown: hidden, minor, normal, or flagged with ⚠ and
  a reason.

Later analyzers plug into the same core without changing it: layout changes [FEAT-0041],
user-defined rules [FEAT-0042], modelling rules [FEAT-0022], how a handler changed
[FEAT-0044], the process contract between callers [FEAT-0032], findings produced by external
tools [IDEA-0006].

### Requirements — levels

1. Every change is resolved to exactly one level per finding:

   | Level | What the reviewer sees |
   |---|---|
   | **Hidden** | Not shown; counted in "N changes hidden by your settings" |
   | **Minor** | Its own colour for a changed element (presentation changes); can be hidden with a filter |
   | **Normal** | Today's "changed" colour — the default for anything no rule claims |
   | **Warning** | Today's colour + a ⚠ marker with the reason |
   | **Critical** | Today's colour + a ⚠ marker in the critical colour with the reason; listed first |

2. **Nothing is lost.** A change no enabled rule matches is reported as "Other change" at
   Normal. When several enabled rules match the same change, the highest level wins. An
   element's level is the highest of its findings.
3. **Direction stays visible.** Added and removed elements keep the added/removed colours
   whatever their level; the level shows through the ⚠ marker and in the table. Minor
   changes the fill only for a *changed* element.
4. **Honest wording.** Reasons say a change *may* affect something and why ("May change the
   path instances take when no condition matches: the default flow changed"), with the
   before → after values where they help. Nothing ever claims a change *is* safe.

### Requirements — display

5. **Diagram (BPMN)**: fill by direction and level as above; a ⚠ badge on elements with a
   Warning/Critical finding, its reasons in a tooltip that is reachable by keyboard focus as
   well as hover.
6. **Changes table (BPMN)**: each row shows its level and reason(s); counters per level;
   a **Hide minor changes** toggle (off by default, remembered for the viewer; hides minor
   rows, their colouring and their ☼ outline); flagged rows can be sorted first.
7. **Properties panel (BPMN)**: for a selected element with findings, the reasons are shown
   above the property groups.
8. **Toolbar (BPMN and DMN)**: a ⚠ counter of Warning/Critical findings; clicking it goes to
   the next one in a documented order (table order, wrapping), selecting it and revealing its
   side and plane (opening a collapsed subprocess, switching to the side where a removed
   element exists).
9. **DMN**: a flagged rule or column header carries the ⚠ marker with its reasons; a
   table-wide finding (hit policy, aggregation, rule order) sits on the table header.
10. **Notices** replace an unexplained empty or all-minor diff, worded only as strongly as
    the comparison supports:
    - "No changes detected in the compared process/decision";
    - "Only the drawing differs" (layout; see [FEAT-0041] for showing it);
    - "Only minor changes (N)";
    - and, whenever anything is hidden, "N changes hidden by your settings · Show all".
    Not shown for an absent side, a failed load or a single-version view — those keep their
    own states. The "no changes" / "only the drawing" wording requires [BUG-0053] fixed:
    until then a retargeted flow plus a moved shape would qualify.
11. **Edit mode (BPMN)**: the original review markers on the opened side use the same
    levels; live edits keep their own colouring and precedence; nothing here touches the
    user's own element colours, the undo history, or the clean XML download. Flags inside
    the editor are a follow-up.
12. **Analyzer status**: a background analyzer that fails or does not finish says so
    ("Handler analysis unavailable"), rather than looking like a clean result.

### Requirements — profile (settings)

13. A settings page lists all rules as a tree, **groups → rules**, each with an on/off
    checkbox and a level; a group's level is the default for its rules. Search by name.
    "Reset to defaults". Analyzers contribute their own groups automatically.
14. The profile is part of the existing settings export/import. Only the user's overrides
    are stored, so the profile stays small and survives rule additions in new versions.
15. A diff opened from a host page reads the current profile; nested tabs (dive-in, edit)
    use the profile of the review they were opened from.

### Requirements — privacy

16. Computing and showing findings makes no network request beyond what the analyzers
    already need to load files from the user's own GitLab/GitHub. No diagram content
    (names, ids, expressions, paths) leaves the browser.
17. Each built-in finding offers **Wrong flag?**: it opens a pre-filled GitHub issue in this
    project's repository containing only the rule id, the standard element type, the Camunda
    dialect and the extension version. Opening the link sends exactly these fields; nothing
    else is sent. Not offered for user-defined rules (their ids and reasons may be private).

### Built-in rules — the starter set (v1) and the rest

Defaults below; every one is switchable and re-levelable. "v1" marks the small, verified set
to ship first; the rest follow without changing the mechanism. Reasons are drafts.

**Labels & documentation → Minor (v1).** Literal human-readable text with no execution
meaning, scoped by owner type and dialect, not by attribute name alone:
- names of tasks, events, gateways, sequence flows, pools, lanes; group category values;
  text-annotation text; error and escalation *display* names;
- documentation — except on a Camunda 7 user task, where it becomes the runtime task
  description (Normal);
- an association that only attaches a text annotation (adding, removing, re-attaching it);
- DMN: the decision display name, input and output labels, rule descriptions.
Not minor: names that are expressions (`${…}`), message and signal names, error and
escalation codes, ids and references, parameter/variable names, a compensation association
(it wires the handler that undoes work), data associations, and any unknown field.

**Routing.**
- v1 · A sequence flow's condition changed, was added or removed, on a flow whose condition
  is evaluated — Critical. (Not on a flow out of a parallel gateway, or a default flow:
  there it selects nothing.)
- v1 · A gateway's type changed (e.g. exclusive → parallel) — Critical.
- v1 · A default flow was set, cleared or replaced — Critical.
- v1 · A sequence flow now starts or ends at another element — Critical.
- A sequence flow was added or removed — Warning (one finding for a new branch, not one per
  nested field).
- The relative order of an exclusive gateway's outgoing conditional flows changed (Camunda 7
  evaluates them in order; with overlapping conditions the order picks the winner) —
  Warning.

**Integrations.**
- v1 · The implementation changed: Camunda 7 class, delegate expression, expression,
  implementation type, external-task topic; Camunda 8 job type — Critical.
- v1 · The called process or decision changed, or its version selection (binding, version,
  version tag, tenant) — Critical.
- Input/output mappings, call-activity variable passing (including Camunda 8 propagation),
  business key, result variable / decision result mapping changed — Warning.
- Execution/task listener implementation, Camunda 8 job headers — Warning (later).

**Events.**
- v1 · A message or signal name, an error or escalation code, or a Camunda 8 correlation key
  changed on a site in this file; a catch changed between a specific code and catch-all —
  Critical. The reason names the contract ("Message correlation", "Signal broadcast",
  "Error matching") and is attached once to each affected element. An unreferenced
  definition gets no flag.
- An event switched between interrupting and non-interrupting — Critical, only for event
  kinds where both exist (not for error catches, not for compensation boundaries); an
  omitted attribute equals its default (`cancelActivity` / `isInterrupting` = true).
- A timer definition changed (date, duration, cycle, or the kind) — Warning, the reason
  naming the timer kind.
- A boundary event attached to another activity — Critical.

**Execution.**
- Multi-instance added/removed, sequential ↔ parallel, completion condition — Critical;
  collection, cardinality, element variables, Camunda 8 input/output element and output
  collection — Warning. A whole new loop is one finding.
- A script changed (language, resource, body; Camunda 8 FEEL expression / result variable)
  — Warning.
- Camunda 7 asynchronous continuations (before/after), job exclusivity, retry cycle;
  Camunda 8 job retries — Warning. Exclusivity on a synchronous activity is not flagged.

**Migration of running instances.**
- An element where instances can wait was removed, or changed type, in the executable
  process: user task, receive task, intermediate catch event, event-based gateway, call
  activity, Camunda 7 external task and any element with an asynchronous continuation,
  Camunda 8 job worker task, joining parallel gateway; a removed boundary or
  event-subprocess start is a removed *subscription* (its own reason) — **Warning**.
  Reason: "If you migrate running instances, those waiting here need an explicit mapping or
  cannot be migrated." Deploying a new version does not affect running instances by itself;
  the flag must not suggest otherwise. An id replaced by a new element is a removal plus an
  addition — never guess a rename from similar labels.

**DMN.**
- v1 · Hit policy or COLLECT aggregation changed (an omitted hit policy equals UNIQUE) —
  Critical.
- v1 · Surviving rules changed their relative order under FIRST or RULE ORDER — Critical, one
  finding on the table (FIRST may pick another winner; RULE ORDER returns the same matches in
  another order). Not for UNIQUE, ANY, COLLECT. PRIORITY and OUTPUT ORDER are not supported
  by Camunda and get no behavioural claim.
- A rule added or removed — Warning, one finding per rule (not one per entry).
- An input expression, input type, Camunda 7 expression language / input variable, an
  output name or output type changed — Critical (callers may read results by output name).
- An input or output entry of a surviving rule changed, or an entry moved relative to its
  column — Warning.
- A column added or removed — Critical.

**Handler code (second analyzer, v1).** The existing "handler changed in this MR" detection
becomes a finding, "Handler code changed in this merge request" — Warning, with the link to
the handler's diff as today.

### Delivery inside this task

One public issue; internal steps, each shippable:

1. **Typed changes** from the comparators: every difference carries its owner element, the
   field or structural operation (changed / added / removed / reordered / retargeted), the
   base and head values, and the dialect — even where no panel group exists; unknown changes
   keep their evidence. No visible change. Do this together with [BUG-0053].
2. **Core + v1 rules + display** (levels, diagram, table, toolbar counter, notices).
3. **Handler badge as findings** — proves the core is not XML-shaped.
4. **Profile UI** with export/import.
5. **Remaining rules**, the panel line, DMN markers, **Wrong flag?**.

### Out of scope

Layout ([FEAT-0041]); user-defined rules ([FEAT-0042]); profiles shared from the repository
([FEAT-0043]); flags inside the editor (follow-up); any analysis across files.

## Context

GitHub: [#52](https://github.com/kaoalllex/bpmn-surf/issues/52)

### How it keeps today's behaviour (sync vs background)

Today the XML diff runs synchronously once both versions are loaded, before the first
paint (`BpmnDiffer#showMr` / `#showBranch` → `#prepareDiffData` → `#paintDiffs`), and the
changed-handler scan already runs in the background: `#loadChangedHandlers` is started
without `await`, and when it resolves it calls `HandlerNavigator#refreshChangedBadges`
(`src/differ/bpmn/bpmn-differ.js` around lines 285 and 786). The core keeps exactly this
split:

- a **synchronous analyzer** (XML diff, later layout and modelling rules) runs in the same
  place as today, so the first paint is unchanged;
- a **background analyzer** (handler code, later process contract, external findings)
  merges its findings when it resolves, re-rendering only badges, table rows and counters —
  the same thing `refreshChangedBadges` does now. Its failure becomes a visible status
  (requirement 12) instead of the current `console.warn`.

No timeouts or scheduling beyond that: the network calls keep their existing error handling.

### Shapes (non-binding)

- **Finding**: `{ analyzer, kind, level, owner: { file, ref, elementId }, side, reason,
  before?, after?, evidence? }` — `owner.file` lets a later analyzer point into another file;
  `side` is base→head regardless of which side is on screen.
- **Analyzer**: `{ id, catalogue: [{ kind, group, title, defaultLevel, reason }], run(context) }`
  where `run` returns findings (sync) or a promise (background). The catalogue feeds the
  settings tree.
- **Rule** (XML analyzer): `{ id, group, match: { ownerType?, field?, op?, dialect? }, level,
  reason }`. Rules that need more than a field match (default flow, endpoint, removed wait
  state, DMN rule order) are answered by the typed changes of step 1 emitting dedicated
  operations, so the rules themselves stay declarative — and [FEAT-0042] can add rows in the
  same format.

### Current code to build on

- `src/differ/bpmn/bpmn-xml-comparator.js` — `#DIFF_TO_PROPERTY_GROUP_MAP` (diff key → panel
  group), `#IGNORED_DIFF_PROPERTY_GROUP` / `#HEADER_DIFF_PROPERTY_GROUP`; the result exposes
  groups (`nodeIdToDiffsMap`), not keys or values — step 1 adds them. A type mismatch returns
  an empty key list; listener field changes collapse to the listener tag; process-level
  changes are keyed by the pool that holds the process (`changedProcessIds` when pool-less).
- `src/differ/dmn/dmn-xml-comparator.js` — returns selectors, ids and output *labels*; the
  painter matches outputs by label ([UX-0004]: two outputs with one label, or none, break).
- Display: `diff-highlighter.js` (fills, markers, ☼), `changes-table-view.js` (rows per
  visible plane, counters, "N changes inside" rows for collapsed subprocesses),
  `properties-panel-highlighter.js`, `search-panel.js` (prev/next navigation pattern),
  overlay badges in `handler-navigator.js` / `correlation-navigator.js`,
  `dmn-diff-painter.js`.
- Dialect: `src/differ/shared/camunda-dialect.js` picks Camunda 8 if either side looks like
  it. Engine-specific rules must apply to the version they describe (a Camunda 7 → 8
  migration has a Camunda 7 base and a Camunda 8 head).
- Settings: `src/core/settings.js` (`chrome.storage.sync`, versioned export with a format
  gate); reaching the differ page via `diff-params-builder.js` / `differ-params.js`.
- Feedback: `src/differ/shared/feedback-report.js` builds today's general feedback issue —
  the **Wrong flag?** link is a separate, allowlisted builder.

### Open questions

- **Where the profile UI lives.** The popup has no room for a rule tree; an extension
  options page (also needed by [FEAT-0042], [FEAT-0022]) with the popup linking to it is the
  likely answer.
- Whether **Hidden** may apply to added/removed elements, or only to changes of surviving
  ones.
- Counting: the notice counts distinct changed elements across the comparison; table
  counters count visible rows on the current plane; an element with minor and normal
  changes counts once, as normal. Confirm.
- How a mixed properties-panel group (a minor and a normal change in one group) is
  highlighted.
- Final level names and the default levels as a set.
- Reviewers with different profiles see different diffs — mitigated by the "hidden" notice
  and, later, by [FEAT-0043].

### Acceptance (examples, not exhaustive)

- Per v1 rule: a positive and a near-miss fixture pair (Camunda 7 and Camunda 8 where the
  rule applies; DMN for the DMN rules) gives exactly the expected finding, level, reason and
  before → after, on both sides of Switch branch.
- A task renamed and given another job type: one element, level Critical, two findings; with
  **Hide minor changes** on, it stays visible.
- A text annotation re-attached → Minor; a compensation association re-attached → Normal or
  above, never hidden by the minor filter.
- Only shapes moved → "Only the drawing differs"; only a rename → "Only minor changes (1)";
  identical files → "No changes detected…"; a load failure → the existing error state, no
  notice.
- Switching a rule off / re-levelling it changes the next opened diff; reset restores
  defaults; export → import into a fresh profile → identical findings; an older export →
  defaults.
- The handler badge appears as before, now also as a table finding; a failing handler scan
  shows its status.
- The **Wrong flag?** URL contains only the allowlisted fields (test with distinctive
  private names/ids/expressions in the fixture); computing findings makes no request.
- Entry points: a GitHub PR, GitLab rapid and legacy diffs UI (`?rapid_diffs_disabled=true`),
  a repository view, a local comparison, a dive-in and an edit tab each receive the profile.

## Work log

<!-- Each AI session on the task — a separate entry by the template below.
     Add new entries on top (freshest first). -->
