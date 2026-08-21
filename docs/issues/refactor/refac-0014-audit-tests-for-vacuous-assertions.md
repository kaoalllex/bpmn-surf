---
id: REFAC-0014
title: Audit the existing test suite for assertions that cannot fail
priority: medium
status: open
---

## Statement

Seven tests written during [FEAT-0031] turned out to name a behaviour they never
exercised. Every one was caught by review, none by the suite. The rest of the
suite was written the same way — by AI agents, across earlier sessions — so the
same shapes may already be present in it.

Audit the existing tests for assertions that hold regardless of whether the
behaviour they name works, and fix or delete what turns up.

**This is not a request to re-read 1261 tests.** It is a targeted scan for a
small set of known shapes, each of which is greppable.

## Context

### The evidence

The seven cases from FEAT-0031, by shape:

1. a defensive fallback (`layer.ids || []`) asserted with `{ ids: [] }` — an
   empty array is truthy, so the branch was never reached;
2. `assert.doesNotMatch(out, /Ghost_1/)` — the fixture never contained that
   string, so it held whatever the lookup did;
3. a hardcoded five-field identity key that went stale when a sixth field was
   added — red for five tasks, unnoticed because no task ran the full e2e suite;
4. an `xmlQueue` parameter on a test double that no test ever passed, left from
   a race test that was planned and dropped;
5. `expect(canUndo === null || canUndo === false).toBe(true)` — passed green if
   the `window.__bpmnDifferModeler` seam it read went missing, while guarding the
   feature's single most load-bearing invariant;
6. `assert.deepEqual(paintCalls[a], paintCalls[b])` comparing two Maps that are
   always empty in that double — cannot distinguish "kept the colouring" from
   "flashed clean";
7. a dive-in dedup test whose two sides both derive from the same object, so the
   equality holds by construction for any input — it would pass against the very
   bug it was written to guard (tracked separately as [REFAC-0013]).

The recurring signature: **the name and the comment are accurate, the assertion
is not.** That is what makes these survive review — they read as coverage.

### The counter-evidence, so this is not a witch hunt

`differ-cross-tab-dedup.spec.js` predates FEAT-0031, was honest, and went red the
moment the identity key changed — which is how the drift was found at all. Older
tests are not automatically suspect. The audit is a scan, not a presumption of
guilt.

### Method

Grep for the shapes, then judge each hit by hand:

- absence assertions — `doesNotMatch`, `not.toContain`, `not.toMatch`,
  `toHaveCount(0)`: did the fixture ever contain the thing being denied?
- escape hatches in the assertion itself — `=== null ||`, `|| true`, `?.` on the
  value under test, `toBeTruthy()` / `toBeDefined()` on a compound expression;
- defensive branches exercised with a truthy stand-in for absence — `[]`, `{}`,
  `0`, `''` where the guard tests for a missing key;
- constants that duplicate a formula the production code computes (they go stale
  silently, and only a full-suite run reveals it);
- parameters and fields on test doubles that no test passes;
- tests with no assertion at all, or whose only assertion is that a call did not
  throw.

**Priority order.** Start with the tests that guard invariants, where a silent
pass costs the most: view-mode read-only (`differ-view-only.spec.js`), cross-tab
dedup, diff colouring, and the download paths. Then the rest. Age is not a useful
ordering; blast radius is.

**The confirming check, per suspect test:** break the production code the test
names and confirm the test fails. If it still passes, the test is the defect.

### Prevention

The habit worth adopting for every new regression test: delete the fix, watch the
test fail, then restore the fix. A test never observed failing is an assumption,
not a guard. Worth adding to `docs/testing.md` once the audit has shown which
shapes actually recur here.

## Work log

<!-- Each AI session on the task — a separate entry by the template below.
     Add new entries on top (freshest first). -->
