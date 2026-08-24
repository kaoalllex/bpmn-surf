---
id: REFAC-0013
title: The cross-tab dedup regression test for edit-mode dive-in asserts nothing
priority: medium
status: done
---

## Statement

`test/differ/shared/differ-params.test.js` carries a test named
`'matches the key a nested differ will publish, even from an edit-mode parent'`.
Its comment correctly describes the defect it is meant to guard — an edit tab
diving into another diagram must compute the target's identity key from the
**nested** params, not from its own, because `toNestedDifferParams()` drops
`mode` and the child therefore publishes a view key.

The assertion does not test that:

```js
const nestedRaw = parent.toNestedDifferParams('src/sub.bpmn', 'sub.bpmn');
const targetKey = DifferParams.identityKeyFor(nestedRaw, 'src/sub.bpmn');
const nested = new DifferParams(nestedRaw);
assert.equal(nested.identityKey(), targetKey);
```

Both sides derive from the same `nestedRaw`, which never carries `mode` whatever
the parent's mode is. The `mode: 'edit', editSide: 'target'` on the parent is
inert. The equality holds by construction for **any** parent, so the test passes
against the buggy code it claims to guard — it never calls
`BpmnDiffer#openDifferForFile`, which is where the defect lived.

Net effect: the production fix is correct (reviewed twice by inspection), but
nothing in the suite would catch it regressing.

Expected: a test that actually exercises the dive-in path from an edit tab and
fails if `#openDifferForFile` goes back to computing the key from `this.#params`.

## Context

Found by the whole-branch review of [FEAT-0031], then confirmed by its scoped
re-review; the misleading test was itself written during that review's fix wave.

The natural home is `test/e2e/differ-cross-tab-dedup.spec.js`, which already has
the machinery: `installCapture`, `getOpenCalls`, `getOpenDifferCalls` and a
sibling-tab fixture. The missing case is "an EDIT tab dives into a diagram a
sibling view tab already shows → focus by name, no new differ opened". Its
existing cases cover view-tab dive-in and the edit-vs-view non-dedup, not this.

The same `#openDifferForFile` shape now exists in `src/differ/dmn/dmn-differ.js`.
DMN has no edit mode, so it cannot exhibit the defect today, but the two should
stay in step.

**Wider point worth keeping**, tracked as its own task in [REFAC-0014] (audit the
existing suite for the same shapes). Seven tests written during FEAT-0031 turned
out to name a behaviour they never exercised: a defensive fallback asserted with a
truthy value, an absence assertion for a string the fixture never contained, a
stale hardcoded constant that stayed red for five tasks, an unused test-double
parameter, a guard that passed when its own subject went missing, and this one.
Each was caught by review rather than by the suite. The recurring shape is a test
whose *name and comment* are accurate while its assertion is not — which reads as
coverage in every subsequent review. Worth a habit: when adding a regression
test, delete the fix and confirm the test fails before keeping it.

## Work log

<!-- Each AI session on the task — a separate entry by the template below.
     Add new entries on top (freshest first). -->

### 2026-08-24 · claude-opus-5 · branch `feature/feat-0031-bpmn-edit-mode`

Closed as a **duplicate** — no code or test change here. The work is merged into
[REFAC-0015] §3 (cross-tab dedup in edit mode), which touches the same spec file
(`test/e2e/differ-cross-tab-dedup.spec.js`) and needs the same edit-tab + sibling
view-tab fixture, so splitting it across two sessions would pay for that machinery
twice.

Still valid at the time of closing, and carried over verbatim into §3: the vacuous
assertion at `test/differ/shared/differ-params.test.js:151`, and the missing e2e case
for `BpmnDiffer#openDifferForFile` (`src/differ/bpmn/bpmn-differ.js:712-725`) invoked
from an edit tab. Noted there that the mutation sweep behind [REFAC-0015] could not
have found this one: the defect is a variable swap (`params` → `this.#params`), which
none of its operators produce.
