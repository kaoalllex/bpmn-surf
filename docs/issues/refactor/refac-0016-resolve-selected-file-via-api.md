---
id: REFAC-0016
title: Take the MR's file list from the API instead of from the rendered diff
priority: high
status: open
---

## Statement

`GitLabDomScraper.findSelectedFilePath()` answers two different questions from
one fragile source — the rendered diff markup:

1. **which files are in this MR** — and the answer wrongly depends on what is
   rendered *right now*;
2. **which of them the reader is looking at**.

Only the first can move to the API, and it should: the changes API lists every
file in the MR, the extension already fetches it, and that list does not change
as the page scrolls.

The second cannot. **Measured, not assumed:** clicking a file in the MR file tree
leaves `location.search` and `location.hash` untouched — GitLab intercepts the
click and scrolls. The URL names a file only when the reader arrived by a deep
link.

## Context

### What the URL does and does not carry

Each file-tree entry's `href` is
`…/diffs?file_path=<path>#<sha1(path)>` — the path verbatim *and* its anchor. But
a click never applies it: three clicks in a row on MR !2 left `search=""` and
`hash=""` every time, with all three `<diff-file>` elements still mounted. So the
href is a deep link for others to use, not a record of the current selection.

Not yet measured: whether "Show one file at a time" behaves differently. It is a
per-user preference and the harness runs anonymously.

### The anchor scheme itself is solid

`HandlerLocator#mrFileDiffUrl` already builds
`<diffs url>#<sha1(filePath)>` to deep-link a file, and a live run against
`kao.alllex/bpmn-surf-test` confirmed the element ids match on every file of two
MRs:

```
id=5323aaad90…  sha1=5323aaad90…  billing-service/…/ChargeCardDelegate.java
id=1ed2b97f74…  sha1=1ed2b97f74…  billing-service/…/SendReceiptDelegate.java
id=91156cddc2…  sha1=91156cddc2…  billing-service/…/Billing.bpmn
id=a691805941…  sha1=a691805941…  order-service/…/Payment.bpmn
id=3d4c38e9a7…  sha1=3d4c38e9a7…  order-service/…/PaymentRiskMatrixV2.dmn
```

`PlatformClient#prChangedFiles(iid)` already returns the file list and is already
called (and cached) for the handler badges, so the new path costs no extra
request in the common case.

### What moving the list to the API buys

- The "exactly one diagram in this MR" fallback stops depending on rendering. It
  is the cause of [BUG-0036]'s blinking (rapid diffs unmounts file elements while
  scrolling, so the same page answers "one diagram" and "nothing here" seconds
  apart) and of the ~1.5s `doWithAttempts` poll the legacy branch pays before
  answering null.
- gitlab.com and self-managed stop needing different code *for the list*: the
  changes API predates both diff UIs.
- [BUG-0031] becomes mostly a placement problem. A button per diagram file needs
  to know *which* files — that is the API — and *where* to attach, which is the
  only part left for the DOM, anchored on `#<sha1(path)>`.

### What stays in the DOM

- **Which file is on screen**, whenever the MR shows more than one. The URL does
  not say, and no API can. In all-files mode the honest answer is that there is no
  selection, which is why [BUG-0031] proposes a button per file instead.
- **Where to attach a button** (`#SHOW_DIFF_BTN_PARENT_CONTAINER_SELECTORS`).
- Consequently the legacy `[data-path]` / `.is-active` branch **cannot be deleted
  by this task alone**. It goes once [BUG-0031]'s per-file buttons cover both diff
  UIs and nothing asks "which single file is selected" any more.

`sha1(path)` is a GitLab implementation detail. If it ever changes, the symptom is
"no file resolved" — the same as today's failure — never a wrong file.

## Suggested shape

- The MR's diagram files come from `PlatformClient#prChangedFiles(changeId)`
  (already cached for the handler badges), filtered by extension.
- `findSelectedFilePath()` keeps its signature. Its "only one diagram, use it"
  fallback consults that list instead of the rendered elements; the DOM is read
  only to answer "and which one is on screen", and only when there are several.
- `#extractRapidDiffFilePath` survives for that narrower job; the memory added in
  [BUG-0036] can then go, because absence of rendered elements stops being an
  answer about the diff's contents.
- The list half becomes unit-testable without jsdom: the input is a file list.

Related: [BUG-0031], [BUG-0036], [REFAC-0012] (audit of fragile heuristics).

## Work log
