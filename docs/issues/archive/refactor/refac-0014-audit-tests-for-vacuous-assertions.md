---
id: REFAC-0014
title: Audit the existing test suite for assertions that cannot fail
priority: medium
status: done
---

## Statement

Eight tests written during [FEAT-0031] turned out to name a behaviour they never
exercised. Seven were caught by review, one by manual testing after the branch was
declared green — none by the suite. The rest of the
suite was written the same way — by AI agents, across earlier sessions — so the
same shapes may already be present in it.

Audit the existing tests for assertions that hold regardless of whether the
behaviour they name works, and fix or delete what turns up.

**This is not a request to re-read 1261 tests.** It is a targeted scan for a
small set of known shapes, each of which is greppable.

## Context

### The evidence

The eight cases from FEAT-0031, by shape:

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
8. `differ-edit-markers.spec.js` — `'a freshly opened editor shows no edit
   markers'`, the named guard for the baseline being captured correctly, asserts
   `toHaveCount(0)` at boot, when no recompute has run yet and no marker can exist
   whatever the baseline is. The defect it was written to catch — the baseline
   captured with a different serialisation than the recompute — sat under it until
   a user moved a shape by hand. A guard for "X does not appear"
   has to run after the step that would make X appear.

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

### 2026-08-24 · claude-opus-5 · branch `feature/feat-0031-bpmn-edit-mode`

Scan done, three shapes fixed, prevention recorded. `src/` is unchanged — every
edit is in `test/` or `docs/`.

**Found and fixed**

1. `test/e2e/differ-edit-markers.spec.js` — case 8 from the statement, the one
   genuinely vacuous test in the suite. `'a freshly opened editor shows no edit
   markers'` asserted `toHaveCount(0)` at boot, before any recompute. Rewritten as
   `'an editor back at its baseline shows no edit markers'`: one
   `modeling.updateProperties` command (so a single Undo returns the whole edit),
   assert exactly one marker, Undo, assert none. Confirming check: with the
   baseline corrupted in `EditSession#start`, it is the **only** one of the seven
   specs in that file that fails; the old version passed.
2. `test/e2e/differ-view-only.spec.js` — the two BUG-0011 guards used
   `toBeHidden()` on `.djs-palette` / `.djs-context-pad`, which in Playwright also
   holds for an element that is not in the DOM at all. Added `toHaveCount(1)`
   before each. Confirming check: renaming the selector now fails the spec.
3. Three defensive branches in `src/` reachable only with a falsy value that no
   test passed — found by a mutation sweep, not by reading. One unit test each,
   all three mutations now killed:
   `GitLabPlatformClient#prChangedFiles` `(response && response.changes) || []`
   (the existing "loader yields nothing" case exits at the earlier `!content`
   guard), `BackNavigator` `#getProcessIdsFunc() || []`, `HandlerNavigator
   #setChangedHandlers` `|| new Map()` (its test passed `new Map()` — the truthy
   stand-in the statement names).

**Method, and what came back clean.** Grepped every shape in the statement, then
mutation-swept all 16 defensive guards in `src/` against the unit suite (remove
one guard, run `npm test`; a survivor is an untested or stand-in-tested branch) —
13 were already killed, the 3 above were not.

- All 60 absence assertions checked by hand: every denied class and title string
  exists in `src/` (no dead selectors), and each runs after the action that would
  produce the thing or has a positive control in the same file. Only case 8 failed
  this.
- Zero escape-hatch assertions (`=== null ||`, `|| true`, `toBeTruthy()` on a
  compound) anywhere — the FEAT-0031 one had already been removed. Zero tests
  without an assertion. No unused parameters or fields on the test doubles
  (`xmlQueue` is gone).
- Cases 1–6 are fixed in the tree; case 7 stays open as [REFAC-0013].
- The counter-evidence holds: `differ-cross-tab-dedup.spec.js` and the comparator
  goldens are honest. Age predicted nothing — the one vacuous test was the newest.

**Prevention.** `docs/testing.md` opens with a new section, "Every test must be
observed failing": delete the fix, watch the test fail, restore it — plus the
three shapes above as the ones that actually recur here, and the mutation-sweep
recipe. Also corrected the stale "~0.5 sec" runtime for `npm test` next to it
(1172 tests, ~5 s).

Verification: `npm test` 1172/1172, `npx playwright test` 128/128.

Follow-up: the 16-guard sweep above was widened afterwards to a full mutation run
over the eight files behind the priority invariants (289 mutants, 70% score). That
found coverage gaps rather than dishonest tests, so they are tracked separately as
[REFAC-0015] — with one exception recorded there: `differ-cross-tab-dedup.spec.js`
K3 passes for a different reason than its comment names, which is this task's shape.
