---
id: BUG-0013
title: Handler search doesn't find the source on instances with Advanced Search (Elasticsearch)
priority: high
status: done
---

## Statement

In BPMN schema view mode on `gitlab.example.com`, navigation to a service task's handler
doesn't find the source, even though the task is declared correctly:

```
handler source not found for topic 'ModuleA_Agreement_PreApprove_CreateSigningDocumentInStorage'
```

This is a **separate** cause from [BUG-0012] (ref/path merging): after the BUG-0012 fix, a
clean SHA goes into the request (`ref=a4084af3387695c4182c04522b6fa644bb033d78`), but the Search
API still returns empty.

## Context

Reproduction:
- Schema: `…/example-project/example-repo/-/blob/a4084af3387695c4182c04522b6fa644bb033d78/business/module-a/src/main/resources/bpmn/agreement/AgreementPreApprove.bpmn`
- Task `CreateSigningDocumentInStorage`, the handler is declared in exactly the way that
  `#searchSubscriptionLocation` searches for (the literal topic string in the annotation):

  ```kotlin
  @Component("ModuleA_Agreement_PreApprove_CreateSigningDocumentInStorage")
  @ExternalTaskSubscription("ModuleA_Agreement_PreApprove_CreateSigningDocumentInStorage")
  class CreateSigningDocumentInStorageTask
  ```

The locator code (`handler-locator.js`) searches with two terms:
1. `#searchSubscriptionLocation` → `ExternalTaskSubscription("<topic>")` (a literal with quotes/parens);
2. fallback `#searchExternalTaskBeanLocation` → `class <Topic-capitalized>` (for this
   project a guaranteed miss — the class is named `<Step>Task`, not like the topic).

### What was verified

An experiment on the gitlab.com test project (`dev.example/bpmn-diff-test`, id 57703231),
a file with the same annotation on the default branch, the same Search API:

| Term | ref | Result |
|------|-----|-----------|
| `ExternalTaskSubscription("<topic>")` (quotes+parens) | `main` | **1** found |
| `ExternalTaskSubscription("<topic>")` | commit SHA | **1** found |
| `ExternalTaskSubscription("<topic>")` | — (default) | **1** found |
| bare `<topic>` | `main` / SHA / — | **1** found |
| `class CreateSigningDocInStorageTask` | `main` | **1** found |
| `class <topic-as-class>` (our fallback) | `main` | 0 (as expected) |

Conclusion: on an instance with **basic search** (Gitaly `git grep`, like the gitlab.com test
project) the locator logic is **correct** — a literal with punctuation, ref by SHA, and the bare topic
find the file. Since on example the same request gives `200` + `[]`, example has a different backend —
**Advanced Search (Elasticsearch)**, and it:
- **ignores** the `ref` for blob search, only the default branch is indexed;
- parses the query string differently (`"` = phrase, `(` `)` — service chars) → the literal
  `ExternalTaskSubscription("…")` may not match.

### Root cause (confirmed on example)

**Confirmed: candidate A** — punctuation breaks the query in ES. The term with `"`/`()` doesn't
find it, even though the file is in the index; the bare topic string finds it. Fixed by switching to a
bare search of the topic string (the identifier only, without special chars) + filtering
the results by handler files whose snippet contains `ExternalTaskSubscription`/the topic.

(Candidate B — ES indexes only the default branch — was ruled out: the bare search finds the handler
both with and without a ref. In parallel it was confirmed that ES does in fact index only `master`
[`"ref":"master"` in the response on a request without a ref], but the handler is there, so for
viewing this is not a blocker.)

### Diagnostics to confirm (run in a browser with a example session)

scope=blobs, project 118208, topic `ModuleA_Agreement_PreApprove_CreateSigningDocumentInStorage`:

- D1 bare topic, no ref: `…/api/v4/projects/118208/search?scope=blobs&search=ModuleA_Agreement_PreApprove_CreateSigningDocumentInStorage`
- D2 bare topic, ref=schema SHA: `…&ref=a4084af3387695c4182c04522b6fa644bb033d78&search=ModuleA_…_CreateSigningDocumentInStorage`
- D3 quotes+parens, no ref: `…&search=ExternalTaskSubscription("ModuleA_…_CreateSigningDocumentInStorage")`

Interpretation:
- D1 non-empty, D3 empty → **candidate A** (punctuation). Fix — bare topic search.
- D1 non-empty, D3 non-empty, D2 empty → the ref parameter breaks the ES query → don't send ref (or
  don't send it when it is a SHA).
- D1 empty → **candidate B** (not in the default branch index) → a wider solution.

### How to fix (done)

The instance-independent fix — in `#searchSubscriptionLocation`, search for **the bare topic string**
instead of `ExternalTaskSubscription("<topic>")`: an identifier without special chars is friendly to
both basic search and ES, and the filtering of false matches is already done (a filter by handler files +
a preference for the snippet with `ExternalTaskSubscription`). Sending `ref` was kept: on ES it's
ignored (master is searched anyway), on basic-search instances it scopes correctly.
Affected file: `src/differ/navigation/handler-locator.js`.

Related: [BUG-0012] (ref/path merging — fixed, produced a clean ref, after which this
bug surfaced), [REFAC-0012] (heuristics in `HandlerLocator`).

## Work log

<!-- Each AI session on the task is a separate entry. New entries on top. -->

- **Opus 4.8 · 2026-06-17 · fix/bug-0012-ref-path-merged-in-blob-url-parse** —
  Investigation + fix. Confirmed that the handler is declared correctly
  (`@ExternalTaskSubscription("<topic>")`), and the locator logic works on basic search
  (verified on the gitlab.com test project — all terms find the file). Diagnostics
  D1–D3 on example (the user ran them in the browser) confirmed **candidate A**: the bare topic
  finds the handler (with and without ref), and the term with `"`/`()` gives `[]`. Fix: `#searchSubscriptionLocation`
  now searches for the bare topic string (`handler-locator.js:384-396`). `npm test` — 765 pass.
  status=done.
