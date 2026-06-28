---
id: BUG-0025
title: Diff-highlight (☼) button enabled in branch-only mode despite no diff
priority: low
status: done
---

## Statement

When the differ is opened on a single version (branch-only mode: only `targetRef`,
no `sourceRef` and no `localFileContent`), there is no diff to highlight. The ☼
"diff highlight" button should be disabled (as "Switch branch" is, and as the footer
is omitted), but it is shown **enabled** — clicking it toggles an empty highlight.

## Context

`BpmnDifferView` constructs the ☼ button disabled
(`bpmn-differ-view.js`, `disabled: !this.#params.isSourceVersionDefined()`), but
`BpmnDiffer#showXml` re-enables it unconditionally on every side that has a diagram:

```
this.#view.setHighlightButtonEnabled(true);
```

That line exists to restore the button after an absent side is shown
(`#showAbsentSide` disables it), but it also overrides the constructor's disabled
state on the initial branch-only render. Found while writing the Layer-2 e2e
coverage for branch-only mode (Phase 4b, item B4): the characterization test
expected "disabled" and went red.

### Fix

Gate the re-enable on `isSourceVersionDefined()`:

```
this.#view.setHighlightButtonEnabled(this.#params.isSourceVersionDefined());
```

Download stays unconditionally enabled (a single side is downloadable). BPMN-only:
`setHighlightButtonEnabled` has no DMN counterpart (DMN auto-paints, no toggle).

### Affected files

- `src/differ/bpmn/bpmn-differ.js` — `#showXml`
- `test/e2e/differ-highlight-branch-only.spec.js` — regression test (new, Phase 4b)

## Work log

<!-- newest first -->

### 2026-06-28 · claude-sonnet-4-6 · branch `feature/e2e-phase4b`

Found while writing Phase 4b branch-only e2e coverage. Gated the `#showXml`
highlight re-enable on `isSourceVersionDefined()` so ☼ stays disabled in
branch-only mode; Download unchanged. Regression pinned by the new
`differ-highlight-branch-only.spec.js`. e2e + unit suites green.
