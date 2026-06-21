---
id: FEAT-0027
title: Navigate to the message-correlation point in code for message-catching elements
priority: medium
status: done
---

## Statement

Elements that **wait for a message** (`bpmn:ReceiveTask`, and catch/start/boundary events
with a `bpmn:MessageEventDefinition`) are woken up from code via correlation
(`correlateMessage("<name>")` in Camunda 7, `.messageName("<name>")` /
`newPublishMessageCommand()` in Zeebe/Camunda 8). In our projects this code is usually a
Kafka listener, a handler, or another task handler that correlates a message to "hand control"
to another part of the schema (goto-style).

Add a navigation badge on such elements (in the spirit of the handler badge `</>`,
[FEAT-0003]/[FEAT-0004], and the call-activity dive-in arrow) that finds the correlation
**point in the code** by the message **name** and lets the user jump to it in GitLab.

The message name is a string, and at the correlation site that string must be used — so it is
searchable. But it can be stored in different ways; the MVP covers the common ones and degrades
gracefully on the rest.

## Context

### This mirrors an existing pattern

Architecturally this is the same shape as the service-task handler navigation
(`handler-locator.js` + `handler-navigator.js`): from a BPMN element → derive a string key →
GitLab blob-search → classify/rank hits → overlay badge + dropdown → open `blobFileUrl`.
Proposed new pair: `src/differ/navigation/correlation-locator.js` (search/classify, the testable
core) + `correlation-navigator.js` (overlay badge + dropdown UI).

### Qualifying elements and the message name

Common signal "has a message and waits for it":

| Element | Where the name is |
|---|---|
| `bpmn:ReceiveTask` | `bo.messageRef?.name` |
| `bpmn:IntermediateCatchEvent` + `MessageEventDefinition` | `msgDef.messageRef?.name` |
| message `bpmn:StartEvent` | same |
| `bpmn:BoundaryEvent` + `MessageEventDefinition` | same |

Access to the `MessageEventDefinition` already exists — `handler-locator.js:229-236`
(`#implementationHolder`) does exactly `eventDefinitions.find(d => d.$type === 'bpmn:MessageEventDefinition')`.
We use the message **name** (not the element id) — correlation in Camunda/Zeebe is by `name`.
If `name` contains `${...}` (dynamic correlation) → skip the literal search, degrade (see below).

### Search strategy — by phases (the MVP)

Reuse the existing blob-search: `GET /api/v4/projects/{id}/search?scope=blobs&ref={ref}&search=<name>`,
returns `{path, data, startline}` (same call already used by `handler-locator`/`call-activity-locator`).

**Phase 1 — search for the literal name.** Classify each hit by line content (`data`) and path (`path`):

- **Correlation point** (high confidence) — the line contains a correlation keyword:
  - Camunda 7: `correlate`, `createMessageCorrelation`, `correlateMessage`, `correlateWithResult`
  - Zeebe / Camunda 8: `publishMessage`, `newPublishMessageCommand`, `messageName`
- **Constant declaration** (indirection) — the line matches
  `(static final String|const|val)\s+(\w+)\s*=\s*"<name>"` → capture the constant name → Phase 2.
- **The `.bpmn`/`.dmn` file itself** — exclude (that is the receiving side, the diagram).
- **Config** (`.yml`/`.yaml`/`.properties`) — mark separately (possible source of a dynamic name).
- **Test** (`/test/`, `Test`) — deprioritize.

**Phase 2 — resolve the constant (cases B/C).** For the captured constant name (e.g. `ORDER_PLACED`)
run a second search and keep the hits whose line has a correlation keyword. Catches both
`Messages.ORDER_PLACED` and a statically-imported `ORDER_PLACED`. Cap at the top 1-2 constants to
limit API calls.

### Coverage (MVP scope = A + B + C)

| Case | Looks like | In scope |
|---|---|---|
| **A. Literal at the correlation site** (most common) | `correlate("OrderPlaced")` | ✅ Phase 1 |
| **B. Constant + usage** | `ORDER_PLACED = "OrderPlaced"` → `correlate(Messages.ORDER_PLACED)` | ✅ Phase 1+2 |
| **C. Constant in a separate file** | same, across files | ✅ Phase 1+2 |
| **D. Config / dynamic / expression name** | name from `application.yml`, `${...}` | ⚠️ degrade: show config hits + raw-search link |
| **E. Name arrives in the Kafka payload** | computed at runtime | ❌ impossible by static analysis — state it honestly |

### Ranking (same philosophy as `handler-locator`)

1. Correlation keyword on the line + non-test file → top.
2. Boost if the file name is `*Listener` / `*Consumer` / `*Kafka*` / `*Handler`.
3. Phase-2 constant resolution that reaches a correlation site → top.
4. Plain literal occurrences → middle.
5. Config → lower, but shown.
6. Tests → bottom.

### UI

- **Overlay badge** on the element (like `</>` for handlers / `⤵` for call activity), e.g. `✉→` /
  `📨`, shown on selection when the element has a message name. Search runs **lazily on click**
  (not on every `selection.changed`, to avoid hammering the API). `selection.changed` listener:
  `bpmn-differ.js:158-163`.
- **Dropdown with results** — reuse the menu pattern from `back-navigator.js` (spinner → list →
  close-on-outside-click). Groups: "Correlation points" / "Other references" / "Config". Each item
  `file:line` → opens `blobFileUrl(path, line, ref)` in a new tab (helper at `handler-locator.js:339`).
- **Single high-confidence hit → jump directly, no menu.** When the search yields exactly one
  high-confidence correlation point (a single hit in the "Correlation points" group, no competing
  candidates), clicking the badge opens it straight away — the dropdown is skipped. The dropdown is
  shown only on ambiguity: several candidates, low confidence (only "Other references"/"Config"), or
  the fallback case. (Same spirit as `back-navigator`, which lists callers only when there is a choice.)
- **Fallback** on empty/ambiguous → "Could not pinpoint a correlation point" + a raw blob-search
  link (`blobSearchPageUrl`).

### Known limitations (designed-in, not fought)

- **Cross-repo**: the sender is often in another microservice → another GitLab project. The search is
  scoped to the current `projectId`. Out of MVP; the fallback can offer a link to the global `/search`.
- **Generic/short names** (`start`, `continue`) → noise. Mitigation: the correlation-keyword filter
  resolves most of it; for very short names lower the confidence and warn.
- **basic vs advanced search**: the `ref` param in blob-search only works reliably with Elasticsearch
  (advanced search). `handler-locator` already depends on this and works on our GitLab — we inherit the
  same proven assumption, no new dependency.
- **Cost**: 1 search request per click (+1-2 for Phase 2), cached via `loadFileContent`. Cheap, lazy.

### Tests

Keep the search/classify core (`correlation-locator.js`) pure and testable on plain inputs (mock
search responses + moddle mocks), per the project's test-design preference (many small tests,
public API only):

- Message-name extraction: ReceiveTask (`messageRef.name`); intermediate/start/boundary message event;
  element without a message → no badge; name with `${...}` → flagged dynamic.
- Hit classification: correlation-keyword line → "correlation point"; constant declaration → captured
  constant name; `.bpmn`/`.dmn` path → excluded; `.yml`/`.properties` → config; test path → deprioritized.
- Phase-2 constant resolution: declaration captured in Phase 1 → second search → correlation hit kept.
- Ranking order across a mixed hit set.
- Degrade paths: dynamic name, zero hits, only-config hits → fallback shape.

### Links

- [FEAT-0003], [FEAT-0004] — namespaced handler key and code navigation (shared philosophy).
- [FEAT-0018], [FEAT-0019] — handler badges for message events / listeners; shared `blobFileUrl`,
  `blobSearchPageUrl`, overlay/badge patterns.
- `call-activity-locator.js`, `caller-locator.js` — reverse-search precedent (find call sites by id).

### Affected files (expected)

- `src/differ/navigation/correlation-locator.js` — **new**: name extraction, blob-search, classify,
  rank (the pure, testable core).
- `src/differ/navigation/correlation-navigator.js` — **new**: overlay badge + dropdown UI.
- `src/differ/bpmn/bpmn-differ.js` — wire the navigator into selection/overlay lifecycle (mirror how
  `handler-navigator` / `call-activity-navigator` are wired).
- `manifest.json` + `utils.js#loadScripts` — register the two new scripts (load order).
- `src/differ/styles.css` — badge + dropdown styles (reuse existing classes where possible).
- `test/differ/navigation/correlation-locator.test.js` — **new**: unit tests for the core.
- `handler-locator.js` — reuse `blobFileUrl` / `blobSearchPageUrl`; extract to a shared helper if
  cleaner than duplicating.

## Work log

<!-- Filled in while working on the task; freshest entries on top. -->

### 2026-06-21 · claude-opus-4-8 · branch `feature/correlation-navigation` (follow-up noted)

Created [FEAT-0028] for resolving a message constant declared in a separate global-constants file
(correlation case C): from such a declaration, find the constant's usage site. Deliberately a
separate task, not done inline — a naive global search re-introduces the generic-name flood fixed
in "review fixes 3", so it needs a single-declaration / specificity guard + tests.

### 2026-06-21 · claude-opus-4-8 · branch `feature/correlation-navigation` (review fixes 6)

Generalized the direct-jump: if the dropdown would have exactly ONE result, jump straight to it
without showing the dropdown — regardless of whether it is an exact correlation point or the
single weaker lead. Previously only a single *correlation* point jumped. Suite green (946).

### 2026-06-21 · claude-opus-4-8 · branch `feature/correlation-navigation` (review fixes 5)

Simplified the fallback dropdown per review: dropped the "No exact correlation point — similar
references:" note (just list the leads plainly) and removed the "Search in GitLab" link
everywhere — the project search URL 404s on this instance, so it was useless. Removed the now-dead
`#searchLinkRow` (navigator) and `blobSearchPageUrl` (locator). Suite green (946).

### 2026-06-21 · claude-opus-4-8 · branch `feature/correlation-navigation` (review fixes 4)

Dropped the dropdown group headers: since the groups are mutually exclusive (you see only
correlation points, OR only the weaker leads), a per-group header carried no signal. Now the
correlation case is a flat list, and the fallback shows one note ("No exact correlation point —
similar references:") above the leads. Removed the dead `#GROUP_LABELS`/`#headerRow` and the
`.correlation-menu-header` CSS. Suite green (946).

### 2026-06-21 · claude-opus-4-8 · branch `feature/correlation-navigation` (review fixes 3)

Real code for `FINISH_VERIFICATION_API` showed the deeper bug behind the noise: the message
name is stored in a **generically-named** constant declared and used in the SAME file
(`companion object { const val CORRELATION_MESSAGE = "FINISH_VERIFICATION_API" }` +
`correlateMessageFor(messageName = CORRELATION_MESSAGE)`). Phase 1 captured `CORRELATION_MESSAGE`
and Phase 2 **globally searched** it — matching every handler that names ITS own message
constant `CORRELATION_MESSAGE` (and, via the substring gate, `…_CORRELATION_MESSAGE` too);
`per_page=100` amplified it.

- **Phase 2 redesigned: resolve the constant within its declaring file**, not by a global
  search. New `findConstantCorrelationLine(content, constant)` fetches the declaring file and
  finds the line where the constant is used near a correlation keyword (word-boundary match, so
  `CORRELATION_MESSAGE` ≠ `STS_…_CORRELATION_MESSAGE`). The unrelated handlers are never fetched.
  `resolveWith` now takes `(name, searchFn, fetchFileFn)`.
- Case C (constant in a *separate* constants file) is no longer auto-resolved — it degrades to
  showing the constant declaration / search link. Acceptable trade to kill the flood.
- Tests reworked for same-file resolution + `findConstantCorrelationLine`; suite green (946).

### 2026-06-21 · claude-opus-4-8 · branch `feature/correlation-navigation` (review fixes 2)

Second review (message `FINISH_VERIFICATION_API`): the list showed 4 handlers that correlate
*other* messages and don't contain the name at all, while the real site
(`VerificationStopUseCase.kt`) was missing. Root cause: GitLab Advanced Search tokenises the
underscored name (`finish`/`verification`/`api`) and returns sub-token matches; `classifyHit`
then labelled any keyword-bearing snippet a "correlation point" without checking the name was
present — and only 20 results were fetched, so the genuine match was paginated out.

- **Exact-term gate** in `collectHits`: keep only hits whose snippet literally contains the
  searched term (the message name in Phase 1, the constant in Phase 2). Quoting the search to
  force a phrase is impossible on our GitLab (handler-locator BUG-0013), so post-filtering is
  the fix. Kills the false positives outright.
- **`per_page=100`** in the blob search so the real match isn't crowded out by token-frequency
  ranking of the fuzzy matches.
- +5 tests, incl. the exact reported scenario. Suite green (942). No change to the working
  cases (their snippets always contain the term).

### 2026-06-21 · claude-opus-4-8 · branch `feature/correlation-navigation` (review fixes)

Review of the result list on a real element (`PRODUCT_SERVICE_RESULT_MESSAGE`) showed too
much noise. Refined the display policy:

- **Tests hidden by default.** Test hits (unit + auto-test, any language) are now segregated
  into a `tests` group and never listed. Hardened `isTestPath` to catch what it missed:
  lowercase `*.spec.ts`/`*.test.tsx`, `autotests/`/`e2e/` dirs, JVM `*Spec`/`*IT` classes —
  while not mis-flagging `Latest.kt`/`Audit.kt` or the Italian `…/it/` i18n directory. (A
  future setting to opt tests back in is noted in code; the `tests` group makes it trivial.)
- **Correlation point wins.** When ≥1 correlation point is found, the dropdown shows only
  those; the constant declaration / config / test references are suppressed (a single
  correlation point still jumps directly). The constant/other references are shown only as a
  fallback when no correlation point was pinpointed.
- Don't chase a constant into Phase 2 if it was only declared in a test.
- +10 locator tests (test-detection edge cases, test segregation, phase-2-in-test routing).
  Suite green (938).

### 2026-06-21 · claude-opus-4-8 · branch `feature/correlation-navigation`

Implemented the full MVP (cases A + B + C, with D/E degrading honestly).

- **New** `src/differ/navigation/correlation-locator.js` (`CorrelationLocator`) — the pure,
  testable core: `extractMessageName(bo)` (ReceiveTask / message catch/start/boundary event;
  excludes throw/end; flags `${…}` as dynamic), classification (`classifyHit`), ranking
  (`rankHits`), and the two-phase resolution `resolveWith(name, searchFn)` (constant → usage
  site) behind the network-bound `resolveCorrelations(name, ref)` (blob-search, cached per
  ref+name). Reuses `blobFileUrl` / `blobSearchPageUrl` (duplicated from `handler-locator`, per
  the existing per-locator convention).
- **New** `src/differ/navigation/correlation-navigator.js` (`CorrelationNavigator`) — the "✉→"
  overlay badge + dropdown UI. Lazy search on click, badge spinner, single high-confidence hit
  → direct jump, otherwise a grouped dropdown (mirror of `back-navigator`'s menu), and a
  GitLab-search fallback for the degrade paths.
- Wired into `bpmn-differ.js` (locator in `#init`, navigator in `show()`, badge in
  `#onSelectedElementChanged`). Registered the two scripts in `manifest.json` +
  `utils.js#loadScripts`; `correlation-locator.js` added to `test/support/scope.js`, the
  DOM-glue navigator listed in `source-layout.js#UNTESTED_BY_DESIGN` (like the other navigators).
- Badge/dropdown styles in `styles.css` (reuse `.differ-back-menu*`).
- Tests: `test/differ/navigation/correlation-locator.test.js` (32 cases — name extraction,
  classification, phase-2 constant resolution, ranking, degrade paths). Full suite green (928).
- Docs: `architecture.md` directory tree + two key-files rows.
