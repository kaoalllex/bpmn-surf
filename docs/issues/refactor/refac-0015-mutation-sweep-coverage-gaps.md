---
id: REFAC-0015
title: Close the coverage gaps a mutation sweep found in the priority invariants
priority: medium
status: open
---

## Statement

A mutation sweep over the eight source files behind the priority invariants
(view-mode read-only, cross-tab dedup, diff colouring, download paths) planted 289
artificial bugs and ran the full suite against each. **86 survived** — the suite
stayed green with the bug in place. After discarding log strings and equivalent
mutants, **~57 are real gaps**.

Close the gaps listed below, and make the sweep repeatable so the number can be
re-measured instead of re-derived.

This is a **coverage** task, not a test-honesty audit — [REFAC-0014] was that, and
found only one genuinely vacuous test. One item here (§4) is the exception: a test
that passes for a different reason than the one its comment names.

## Context

### What a mutation sweep measures, and why it is not code coverage

A mutant is a deliberate small edit to production code: `===` → `!==`, `&&` → `||`,
a negated `if`, a replaced string literal. **Killed** = at least one test went red
(good — the suite notices the bug). **Survived** = the whole suite stayed green
(bad — the bug is invisible). Mutation score = killed / total; ours is **70%**.

100% is not the target: *equivalent* mutants change nothing observable (renaming a
constant both sides read from one place) and survive by definition. Every survivor
needs a human verdict.

The difference from line coverage is the point of this task. `DiffHighlighter.paint`
executes in every e2e test, so coverage calls it green — yet the sweep shows nothing
asserts its result.

### Result of the run (2026-08-24, all 289 mutants, suite green at baseline)

| file | mutants | survived | score |
|------|--------:|---------:|------:|
| `src/differ/bpmn/edit/edit-color-resolver.js` | 14 | 0 | 100% |
| `src/differ/shared/diagram-versions.js` | 1 | 0 | 100% |
| `src/differ/dmn/dmn-diff-painter.js` | 26 | 3 | 88% |
| `src/differ/shared/differ-params.js` | 31 | 5 | 84% |
| `src/differ/shared/differ-tab-navigator.js` | 52 | 12 | 77% |
| `src/differ/bpmn/edit/edit-session.js` | 13 | 4 | 69% |
| `src/differ/bpmn/bpmn-differ.js` | 135 | 50 | 63% |
| `src/differ/bpmn/diff-highlighter.js` | 17 | 12 | **29%** |

### The gaps, by blast radius

**1. BPMN diff colouring on the canvas is untested — the largest gap.**
`diff-highlighter.js:36` (`if (shapeIdList.length > 0)`) and `:59` (`rowIdList`)
both survive negation: `DiffHighlighter.paint` can be disabled wholesale and 1172
unit + 128 e2e tests stay green. The `differ-highlight*.spec.js` specs assert only
the `highlight-diff` marker class — which `setEnabled` (the ☼ button) adds, not
`paint` — and state the omission as a choice ("free of brittle computed-color
checks"). No BPMN spec asserts `toHaveCSS('fill'|'stroke')` on a canvas element.
The DMN side *is* covered (88%, `DmnDiffPainter` sets colours inline and
`dmn-highlight-*.spec.js` assert them), so this is exactly the BPMN/DMN asymmetry
the project rules warn about, in the direction nobody checked.
Fix: assert the fill on an added/removed/changed shape and the stroke on a
connection, in all three directions. `modeling.setColor` writes inline
`fill`/`stroke` on the `.djs-visual` child, so it is assertable the same way
`differ-edit-markers.spec.js:142-145` already does for the edit layer.

**2. Edit mode on the target side is not exercised at all.** Three survivors are
one gap: `differ-params.js:12` (`EDIT_SIDE_TARGET = 'target'`) can be renamed
freely because no test ever passes `editSide: 'target'`. Consequences:
`bpmn-differ.js:425` (the edited download picks `targetFileName` vs `fileName` —
BUG-0002 rename handling) and `bpmn-differ.js:247` are both unpinned.
Fix: one `differ-edit-download.spec.js` case with `editSide: 'target'` and a
`targetFileName` that differs from `fileName`.

**3. Cross-tab dedup in edit mode.** `bpmn-differ.js:697` — negating
`if (await focusExistingDifferTab(editIdentityKey(editSide)))` survives.
`differ-cross-tab-dedup.spec.js` covers view mode only, so the invariant FEAT-0031
added the mode suffix to the identity key *for* is unguarded on the edit side.
Fix: mirror the K1/K2 pair with `mode: 'edit'`, and add the case the suffix exists
for — an edit tab must NOT be deduplicated against a view tab of the same diagram.

Plus a fourth case in the same file, merged in from [REFAC-0013] (closed as a
duplicate of this section): **an edit tab diving into another diagram**.
`#openDifferForFile` (`bpmn-differ.js:712-725`) must compute the identity key from
`toNestedDifferParams()` — which drops `mode`, so the child publishes a view key —
and not from `this.#params`. No e2e test ever calls that method from an edit tab, so
the K1 case exists only in view mode. The mutation sweep could not surface this one:
the defect is a variable swap (`params` → `this.#params`), not an operator or
literal its generator mutates.
Fix: an edit tab dives into a diagram a sibling view tab already shows → focus by
name, no new differ opened. And rewrite or delete
`test/differ/shared/differ-params.test.js:151` (`'matches the key a nested differ
will publish, even from an edit-mode parent'`): both sides of its equality derive
from the same `nestedRaw`, so the parent's `mode: 'edit'` is inert and the assertion
holds by construction for any input — it passes against the very bug it names. The
same `#openDifferForFile` shape now exists in `src/differ/dmn/dmn-differ.js`; DMN has
no edit mode so it cannot exhibit the defect today, but the two should stay in step.

**4. `differ-cross-tab-dedup.spec.js` K3 passes for a different reason than it
names.** Its comment says "pagehide closes its registry channel", but mutating
`'pagehide'` (`differ-tab-navigator.js:82`) kills nothing: closing the tab tears the
BroadcastChannel down anyway. The listener is belt-and-braces and the test cannot
tell. This is the [REFAC-0014] shape.
Fix: either drive the pagehide path without closing the tab (dispatch the event and
then query the registry), or correct the comment to say what the test actually
proves and note that the listener is redundant in this scenario.

**5. The highlight pulse phase (UX-0006).** `diff-highlighter.js:8` — the
`highlight-diff-pulse` class can be renamed unnoticed; `:86` — negating
`if (this.#timeoutId) clearTimeout(...)` survives, so switching the highlight off
mid-pulse can leave the timer to re-add markers afterwards and no test objects.
Fix: assert the pulse class right after the ☼ click and the steady class after
`PULSE_DURATION_MS`; add a case that toggles off during the pulse.

**6. Search: scroll-to-match and the properties-panel wait.** Eight survivors in one
function, `bpmn-differ.js:785-834` (`scrollToElement`, the
`propertiesPanel.updated` listener wiring, the retry guard at `:824`, the selection
checks at `:812` and `:834`). `differ-search-centering.spec.js` only asserts that
the viewport transform changed.
Fix: assert the selected element after a search jump, and that the properties panel
shows that element.

**7. Unsaved-work warning and `isDirty`.** `edit-session.js:63,64` — the
`beforeunload` guard is unpinned; `:100` — `'commandStack'` can be renamed because
tests read `canUndo()` straight off `window.__bpmnDifferModeler` instead of going
through `EditSession#isDirty`. Playwright can assert the former via
`page.on('dialog')`.

**8. Smaller, decide case by case.**
- `bpmn-differ.js:459` — `if (this.#changesTableView) clear()` on the absent side.
  `differ-changes-table-state.spec.js` already documents in a comment that the table
  is never populated there, so it characterises an end state, not a transition; the
  mutant confirms `clear()` itself is unguarded.
- `bpmn-differ.js:645` — `if (!sourceRef || !changeRequestId) return;` before loading
  changed handlers; `||` → `&&` survives.
- `bpmn-differ.js:891,893` — properties-panel container lookup and its null guard.
- `bpmn-differ.js:771` — `if (!businessObject) return false`.
- `diff-highlighter.js:45,48,49` — the `bpmn:TextAnnotation` workaround (`setColor`
  does not work for them); no fixture contains a TextAnnotation.
- `diff-highlighter.js:76` — removing the `selected` marker before highlighting.
- `diff-highlighter.js:124` — excluding `bpmn:Association` from highlighting.
- `dmn-diff-painter.js:54,64,111` — `if (cell && cell.parentElement)` null guards.
- `differ-params.js:21` — `if (this.sourceRef && this.localFileContent)`, the
  local-file mode, absent from e2e.
- `differ-tab-navigator.js:150,183,186,208,211` — returns in `catch` branches and the
  cross-origin `focus()` fallback; `:246,251` — `#getLinkOrScriptHref`.
- `bpmn-differ.js:874` — hiding `.bjs-powered-by` (cosmetic).

**Dismissed, do not chase.** 14 survivors are log strings (the sweep skips
`console.*` lines, but the project also logs through its own helper). Equivalent
mutants: the BroadcastChannel names `differ-tab-navigator.js:27,30` (both ends read
one constant); the `requireDefined` labels `bpmn-differ.js:474,497` and
`differ-params.js:80`; `'_blank'` at `bpmn-differ.js:105,114,123,132` (any
non-reserved target still opens a tab); `differ-tab-navigator.js:55`
(`typeof BroadcastChannel === 'undefined'` — always present in Chromium);
`bpmn-differ.js:399` (guards a lone `console.error`). `bpmn-differ.js:902,904` (the
postMessage entry) is a Layer-2 boundary, not a gap — e2e constructs the differ
directly; it belongs to a future Layer-3 suite.

### How to re-run the sweep

The scripts lived in a session scratchpad and are gone; materialise them under
`scripts/` so the score is reproducible. **This is the LAST batch, not the first** —
see the sequencing note below for why. The recipe, including the two traps that cost
an hour:

- **Generator** — walk the target files, skip comment lines and occurrences inside
  string literals, and emit one mutant per occurrence for: `===`↔`!==`, `&&`↔`||`,
  `>=`→`<`, `<=`→`>`, `return true`↔`return false`, `if (COND)` → `if (!(COND))`
  (needs paren matching, so per line), and every `'...'` literal of 2-60 chars on a
  non-`console` line → `'MUT' + rest`.
- **Runner** — per mutant: apply, `node --check` (a syntax error is not a mutant),
  then a funnel — the mirror unit test (`test/<path>.test.js`, ~0.8 s), then full
  `npm test` (~5 s), then `npx playwright test -x --workers=12` (~15 s). First red
  stage wins; green through all three = SURVIVED. Restore the file afterwards, and
  append one JSONL line per verdict so the run is resumable.
- ⚠️ **Run in a copy of the working tree, never in the repo itself.** `rsync -a`
  excluding `node_modules` (symlink it), `.git`, `.codegraph` (it holds a unix
  socket that breaks rsync), `test-results`, `playwright-report`. Rewrite the port
  `4173` → a free one in **both** `playwright.config.js` and `test/` — one spec
  hardcodes it (`differ-update-indicator.spec.js`), so the copy fails its baseline
  otherwise.
- ⚠️ **`execSync`'s `timeout` kills only the shell, not a hung grandchild.** Some
  mutants hang `node --test` forever; without `exec ` prefixed to the command the
  runner stalls indefinitely on one mutant. Prefix every command with `exec ` so the
  shell is replaced by the process the timeout can actually kill.
- **Do not parallelise across copies.** Measured: one copy at `--workers=12` runs the
  full e2e in 15 s; three copies at 4 workers each are slower in total. Spec
  subsetting does not help either — the cost is the differ page boot, not the number
  of specs (48 specs 18.5 s vs 128 specs 15 s).
- Whole run: ~65 minutes, ~3.5 mutants/min.

### Sequencing — do this in batches, not in one sitting

Sized on 2026-08-24 against the actual specs. The whole task is ~6 hours, so it does
not fit one session; it splits cleanly because the batches share no state.

| Batch | Items | Estimate |
|---|---|---|
| **A** — edit-mode invariants | §2, §3 (incl. the dive-in case), §4 | ~1h15 |
| **B** — canvas colouring | §1 | ~30 min |
| **C** — the rest | §5, §6, §7 | ~1h30 |
| **D** — reproducibility | the sweep script + a re-measuring run | 2-3h, of which ~65 min is the run itself |

Do **A + B first**: §1 is the largest blast radius (`paint` can be disabled wholesale
and the whole suite stays green) and §3 is the freshest ground. After A+B the status
is `partial` with C and D listed as the remainder.

Two cost findings worth keeping, because they contradict how the items read:

- **§1 is cheap, not expensive.** `dmn-highlight-added.spec.js:15-16` is a working
  template, and `differ-highlight{,-changed,-removed}.spec.js` already boot the right
  fixtures in all three directions. The work is a two-line `toHaveCSS` addition to
  each existing spec plus one connection case — no new spec files.
- **Batch D is expensive, and it is a metric, not a guard.** The value of this task is the
  killed mutants; the 78% number is bookkeeping. Three hours on the runner buys the
  same protection as zero hours on the runner, while three hours on §5-§7 buys real
  coverage. Hence its demotion from "step one" above. If the budget runs out, drop D
  and say so in the work log — do not drop C for it.

### Definition of done

Of the 86 survivors: 12 are log strings, ~21 are equivalent mutants or the Layer-2
postMessage boundary (both listed above as "do not chase"), **23 are the §1-§7 items
this task must close**, and ~30 sit in §8.

Done = the 23 mutants named in §1-§7 are killed by new or amended tests, re-measured
by a sweep run, and the sweep script lives under `scripts/`. Batch D (the script and
the re-measure) is the one part that may be dropped deliberately: without it the task
closes as `partial`, with the killed mutants argued in the work log instead of
re-measured. The dive-in-from-edit
case folded into §3 from [REFAC-0013] is not one of the 23 (no mutant expresses it),
so it is done when its e2e case exists and the vacuous unit test is gone. §8 is **not** required:
work through the list, fix what is cheap, and record a one-line verdict for each item
left alone so the next run does not re-litigate it. Most of §8 is defensive branches
in `catch` blocks, null guards, and workarounds for shapes no fixture contains
(`bpmn:TextAnnotation`, `bpmn:Association`) — a test there usually costs more than it
protects.

Expected score after §1-§7: roughly 70% → 78% on the same 289 mutants. Closing §8 as
well would reach ~88%; the remainder is equivalent mutants and cannot be killed.

If a §1-§7 item turns out to be an equivalent mutant on closer reading, say so in the
work log and move it to the dismissed list rather than inventing a test for it.

### Scope note

Only the eight priority files were swept — 289 of roughly 1200 mutable points in
`src/`. The other 66 source files are unmeasured. Widening the sweep is a separate
decision, not part of this task.

## Work log

<!-- Each AI session on the task — a separate entry by the template below.
     Add new entries on top (freshest first). -->
