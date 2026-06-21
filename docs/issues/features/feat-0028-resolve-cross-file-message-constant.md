---
id: FEAT-0028
title: Resolve a message constant declared in a separate constants file (correlation case C)
priority: low
status: open
---

## Statement

Follow-up to [FEAT-0027] (navigate to the message-correlation point in code). Today the
correlation search resolves a message name that is kept in a constant only when that constant is
declared AND used to correlate **within the same file** (the companion-object idiom —
`CorrelationLocator.findConstantCorrelationLine`). When the constant lives in a **separate
global-constants file**, e.g.:

```kotlin
package com.example.bpm.order.process.verification.util

const val ACCOUNT_STS_SCREEN_COMPLETED_CORRELATION_MESSAGE = "OPTION_CAR_REQUEST_ACCOUNT_STS_SCREEN_COMPLETED"
const val STS_IMAGE_TECM_IDS_DELIMITER = ";"
const val OPTION_ID_SCREEN_PARAM = "optionId"
```

Phase 1 finds this declaration (the file contains the literal message name), but Phase 2 fetches
that file and finds no correlation usage in it (it is just constants), so we degrade to showing
the declaration as a weak lead. The enhancement: from such a declaration, go on to find the
**usage site of the constant** (the handler that imports it and calls `correlateMessageFor` /
`correlate` / `publishMessage` with it) and surface THAT as the correlation point.

## Context

### Why this was deliberately NOT done in the MVP

The obvious implementation — a global blob-search for the constant name — is exactly what caused
the noise regression fixed during [FEAT-0027] (see its work log, "review fixes 3"). Message
constants are routinely named **generically** and scoped to a companion object
(`const val CORRELATION_MESSAGE = "…"`), so a global search for `CORRELATION_MESSAGE` matched
every handler that names ITS OWN (different) message constant the same way — flooding the result
with unrelated correlations. That is why Phase 2 was deliberately restricted to same-file
resolution.

The case in this task is different: `ACCOUNT_STS_SCREEN_COMPLETED_CORRELATION_MESSAGE` is a
**specific, globally-unique** constant name. A global search for it would precisely find its one
usage. So the feature is feasible — but only if we can tell a unique/specific constant apart from
a reused/generic one, or the flood comes back.

### Known patterns (from real code — ground truth to design against)

Two shapes must be told apart; only the first should be resolved here.

**(C) Unique global constant — RESOLVE.** Declared once in a constants file, imported and used by
simple name at the correlation site:

```kotlin
// …/order/item/process/verification/util/Constants.kt  (declaration — pure constants file)
const val ACCOUNT_STS_SCREEN_COMPLETED_CORRELATION_MESSAGE = "OPTION_CAR_REQUEST_ACCOUNT_STS_SCREEN_COMPLETED"

// …/SomeHandler.kt  (usage — imports the constant, correlates with it)
import com.example.…util.ACCOUNT_STS_SCREEN_COMPLETED_CORRELATION_MESSAGE
…
processMessageCorrelationService.correlateMessageFor<…>(
    messageName = ACCOUNT_STS_SCREEN_COMPLETED_CORRELATION_MESSAGE, …)
```

**(generic) Companion-object constant — DO NOT resolve via global search.** Many classes declare
their OWN message under the same generic name; a global search floods (this is the FEAT-0027 fix-3
regression). These are already handled by same-file resolution, so this task must not touch them:

```kotlin
class CarPreOfferScreenMessageHandler(…) {
    fun handle(…) { service.correlateMessageFor<…>(messageName = CORRELATION_MESSAGE_NAME, …) }
    companion object { const val CORRELATION_MESSAGE_NAME = "CREDIT_LINE_CAR_PRE_OFFER_SCREEN_COMPLETED" }
}
```

Note the usage references the constant **by simple name after an import**, so the global search
term is the **simple constant name** (no package) — `\bNAME\b` matches both the import line and the
`messageName = NAME` line. Fully-qualified usages, if any, also contain the simple name.

### Proposed approach

Trigger only when same-file resolution (`findConstantCorrelationLine`) returns null for a captured
constant (i.e. the declaring file is a pure constants file). Then:

1. **Global-search the constant name** (`searchFn(constantName)`), keeping only hits whose snippet
   references the constant by **word boundary** (`\bNAME\b`, so `CORRELATION_MESSAGE` does not
   match `STS_…_CORRELATION_MESSAGE`) AND carries a correlation keyword.
2. **Guard against generic/reused names — the crux.** Accept the usages only when the constant
   name is unambiguous. Candidate discriminators (pick/validate during implementation):
   - the constant is declared in exactly **one** place across the repo (count `… NAME = "…"`
     declarations in the search results; >1 ⇒ generic ⇒ abort, degrade);
   - and/or a specificity heuristic on the name itself (length, number of `_`-separated parts) as
     a cheap pre-filter before searching.
   The single-declaration check is the robust one; the name heuristic is only an optimization to
   avoid a search.
3. **Route** the surviving usages through the existing grouping (correlation / tests). Cap the
   number of constants chased (as today, ≤2) and the work per constant.

Degrade exactly as now when the guard rejects (generic name) or nothing is found: show the
constant declaration as a weak lead.

### Notes / smaller decisions

- **No-noise wins.** When the guard is uncertain, prefer a false negative (degrade to the weak
  lead) over a false positive (showing unrelated correlations). The user's repeated feedback on
  FEAT-0027 was that noise is worse than a missing result.
- **Multiple valid usages.** A unique constant may be correlated from more than one site (legit
  fan-out) — surface all of them (they route through the normal grouping; one result still jumps
  directly, several show the flat-list dropdown).
- **Search budget.** Reuse the existing `per_page=100` and the per-call cache (`resolveCorrelations`
  caches per ref+name, so the extra search is paid once per message). Keep the ≤2-constants cap.
- **Reuse, don't duplicate.** The usage classification can reuse `findConstantCorrelationLine`'s
  logic (constant-by-word-boundary near a correlation keyword) applied to each fetched candidate
  file, rather than a second keyword scan — factor a shared helper if cleaner.
- The single-declaration count and the name-specificity heuristic are **implementation decisions to
  validate against the real repo during the work**, not fixed up front; start strict.

### Acceptance criteria

- A message whose name is stored in a unique global constant (the example above) resolves to the
  handler that uses that constant to correlate — jumped to directly when it is the only result.
- A message stored in a generically-named companion-object constant (`CORRELATION_MESSAGE`) still
  does NOT flood the list with other messages' correlations (no regression of FEAT-0027 fix 3).
- The same-file (companion-object) case keeps working unchanged.
- Cost stays bounded: at most ~1 extra search per captured constant, capped at 2 constants.

### Tests

- `resolveWith` with fakes: a unique global constant → usage resolved; a constant with multiple
  declarations across files → rejected (degrade), proving the flood guard.
- Word-boundary matching of the constant in usage classification.
- Same-file case still resolves via `findConstantCorrelationLine` without triggering the global
  path.

### Affected files (anticipated)

- `src/differ/navigation/correlation-locator.js` — the conditional Phase-2b global resolution with
  the single-declaration guard; possibly a small `isSpecificConstantName` / declaration-count
  helper.
- `test/differ/navigation/correlation-locator.test.js` — cases above.
- `docs/architecture.md` — update the `correlation-locator.js` Phase-2 description.

### Links

- [FEAT-0027] — the base feature; its work log documents the noise regression that motivates the
  guard here.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
