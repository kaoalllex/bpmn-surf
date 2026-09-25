---
id: BUG-0036
title: The MR diff button goes stale when another file is selected
priority: high
status: done
---

## Statement

On an MR diffs page, once the button is on the page it is never re-evaluated, so
selecting another file leaves the previous file's button in place.

Observed on the test sandbox with "Show one file at a time" on:

- select a `.java` → no button (right);
- select `Billing.bpmn` → button appears (right);
- select the `.java` again → **the button stays** (wrong). Clicking anywhere else
  removes it, because a `mouseup` runs the whole flow again.

The same mechanism explains the swapped labels on an MR holding one `.bpmn` and
one `.dmn`: the button kept from the previously selected diagram says "Decision
diff" while a `.bpmn` is on screen, and the other way round. It is not a file-type
detection error — it is the previous file's button.

## Context

`App.#observeDomChanges` returned early whenever `uiRepoProvider.isButtonPresent()`.
The guard exists so that adding the button does not retrigger the observer that
added it, but it also suppressed every legitimate re-check.

Found while checking [BUG-0034]; unrelated to it.

## Work log

### 2026-09-25 · claude-opus-5 · working tree (uncommitted)

The guard now asks whether the button belongs to the file on screen, not merely
whether a button exists. `addButton` records the path on the element
(`data-bpmn-surf-file-path`), `UIRepoProvider.buttonFilePath()` reads it back, and
the observer compares it with the file the page currently shows — the selected
diff on an MR, the blob path in branch view. The mode is asked through
`isChangeViewActive()` rather than by sniffing the URL in `App`, and every getter
is called inside a try/catch because they throw before a successful provider init.

No loop: a rebuild ends with the button matching the shown file, so the next
observer tick bails.

Not verified in a browser yet — needs the sandbox cases above re-run.
Files: `src/content/app.js`, `src/content/providers/ui-repo-provider.js`,
`src/content/providers/gitlab/gitlab-ui-repo-provider.js`,
`src/content/providers/github/github-ui-repo-provider.js`.

### 2026-09-25 · claude-opus-5 · working tree (uncommitted), second pass

The first pass removed the `isButtonPresent()` early return, and the console log
from a real run showed it had been holding back two separate defects:

1. **Rapid diffs unmounts its `<diff-file>` elements** as the reader scrolls or
   hovers, so the same page answered `single diagram: Billing.bpmn` and
   `cannot determine` a second apart — the button blinked. With zero elements the
   lookup also fell through to the legacy branch and spent ~1.5s polling for
   `[data-path]` before answering null.
2. **`#doStart` rebuilt the button unconditionally.** Removing and re-adding it is
   a DOM change, which woke the observer that had just called it: a self-feeding
   cycle every ~600ms, visible in the log as an unbroken run of
   `starting... after dom change`.

Both fixed:

- `GitLabDomScraper` remembers the last path it resolved and the page it belongs
  to. An empty DOM on the same page returns that path instead of null — absence
  of rendered elements is not absence from the diff. The memory is dropped as soon
  as elements *are* rendered and none of them is a diagram, so selecting a `.java`
  still removes the button.
- `App` no longer resets up front. A button that already belongs to the file on
  screen is left alone (no DOM change, so the observer settles), and `reset()` is
  called only where the answer is "there should be no button here".

Covered by five new `gitlab-dom-scraper` tests, including the unmount case and
its counter-case. `npm test` green (1261).

Still open and unchanged: an MR with two diagrams and no selection shows no button
at all — that is [BUG-0031], whose fallback wants exactly one diagram.

Verified only by unit test. This is the third blind iteration on live GitLab
markup; the next one should be driven against the real page.

### 2026-09-25 · claude-opus-5 · verified against the live sandbox

The sandbox is public now, so the extension was driven by Playwright
(`chromium.launchPersistentContext` + `--load-extension`) against the real MRs
instead of being reasoned about.

It immediately caught a defect in the fix above: `data-bpmn-surf-file-path` was
written on the inner `<button>`, while `#buttonId` — the element
`buttonFilePath()` reads back — is the surrounding container. The path always read
back as undefined, so the "nothing changed" check never matched and the button was
rebuilt on every tick. Moved the attribute onto the container.

Measured on MR !2 (one diagram among three files), 10s of sampling:

| | before | after |
|---|---|---|
| button state changes | flipped every ~2s | **0** |
| rebuilds per run | one every ~600ms | **1** |

MR !3 (two diagrams, no hash): no button, and no churn either — that is
[BUG-0031], untouched.

Not yet covered: "Show one file at a time" **on**. It is a per-user preference and
the harness runs anonymously, so cases a1/a2 from the original report still need a
signed-in run.

### 2026-09-25 · claude-opus-5 · verified in both diff modes

`test/e2e/live/mr-button.mjs --walk` now clicks every file of an MR, twice round,
and checks which file the button belongs to after each click. Twice round
matters: a single pass ends on the diagram and never exercises the transition
this bug was about.

Signed in, with "Show one file at a time" **on** (set and restored with
`diff-mode.mjs`):

| MR | walk | result |
|----|------|--------|
| !2 | .java → .java → .bpmn → .java → .java → .bpmn | button appears only on the diagram and **goes away again** on the next .java — every step OK |
| !3 | .bpmn → .dmn → .bpmn → .dmn | "Schema diff" on the .bpmn, "Decision diff" on the .dmn — every step OK |

MR !3 also settles the swapped-label report: the labels were never wrong, the
button was simply the previous file's.

With the preference **off** (all files at once): MR !2 shows a stable button for
the single diagram, MR !3 shows none — [BUG-0031], untouched.

Button state changes over 10s: 0 in every run. Rebuilds: 1 without clicking, 4
across a six-click walk — one per real change.

Closed.
