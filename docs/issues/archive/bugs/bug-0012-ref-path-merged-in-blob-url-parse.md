---
id: BUG-0012
title: In view mode the ref is merged with the path → the handler search doesn't find the source
priority: high
status: done
---

## Statement

In BPMN schema **view** mode (the `/-/blob/<SHA>/<path>` page, not an MR diff), when
navigating to a service task's handler, the source search fails:

```
handler source not found for topic 'ModuleA_Agreement_PreApprove_GenerateAdditionalAgreementToCreditAgreement'
```

The diagram itself opens normally — the bug shows up only on navigation to the handler.

## Context

Reproduction:
- Schema: opened in blob view by a bare 40-character commit SHA, under a module path that
  does not start with the project name —
  `/-/blob/<sha>/business/module-a/src/main/resources/bpmn/agreement/AgreementPreApprove.bpmn`
- Task: `GenerateAdditionalAgreementToCreditAgreement`.

A Search API request goes to the log where `ref` = **SHA + the path to the schema directory**, not a clean SHA:

```
GET /api/v4/projects/42/search?scope=blobs
    &ref=<sha>%2Fbusiness%2Fmodule-a%2Fsrc%2Fmain%2Fresources%2Fbpmn%2Fagreement
    &search=class%20ModuleA_Agreement_PreApprove_GenerateAdditionalAgreementToCreditAgreement
```

The response — `200` and the body `[]`: GitLab takes `ref` literally as a branch/commit name, no such ref exists → nothing found.

### Root cause

Incorrect blob-URL parsing in `GitLabUrlParser.extractBranchCommitIdAndFilePath`
(`src/content/providers/gitlab/gitlab-url-parser.js:121-144`). Three conditions coincided:

1. **The DOM hint is empty.** `branchCommitIdHint` is taken from
   `domScraper.findBranchCommitIdText()` (`gitlab-repo-provider-base.js:148`). On the
   page of a file opened by a bare commit, the ref selector didn't match → `null`.
2. **The primary regex didn't fire.** It is anchored on the project name:
   `` `\/-\/blob\/([0-9a-zA-Z-_./]+)\/(${projectName}\/.*)` `` (`projectName = "example-repo"`).
   The repo-relative file path (`business/module-a/src/…`) does not contain `example-repo/`,
   so the regex doesn't match. This heuristic only works in principle if the top
   directory matches the project name — for this module it is different.
3. **The fallback greedily ate the path.** Without a hint, `branchCommitId` is assembled from
   alternatives, the last of which is the catch-all `[0-9a-zA-Z-_./]+` (includes `/`),
   greedy: `` `\/-\/blob\/(master|develop|feature\/…|bugfix\/…|[0-9a-zA-Z-_./]+)\/(.*)` ``.
   The group captured everything up to the last `/`:
   `branchCommitId = <sha>/business/…/agreement`, `filePath = AgreementPreApprove.bpmn`.

**Why viewing still works, but the search doesn't.** The corrupted `targetRef`
is used in two incompatible ways:
- Loading the diagram: `rawFileUrl` = `${projectUrl}/-/raw/${ref}/${filePath}`
  (`differ-params.js:52`). The concatenation **restores the full path**, and the `/-/raw/`
  endpoint itself separates ref and path (it recognizes a 40-character SHA) → the schema loads.
- Handler search: `#searchBlobs` sends `ref` as a separate query parameter
  (`handler-locator.js:444-446`). It is taken literally, the path inside the ref is not
  trimmed → `[]`.

### How to fix

The minimal fix, independent of the fragile DOM, is to add to the fallback alternation
**an explicit commit-SHA pattern before the catch-all**, so the hex-SHA is captured exactly and doesn't
"pull in" the path (`gitlab-url-parser.js:128`):

```js
branchCommitId = 'master|develop|feature\/[0-9a-zA-Z-_.]+|bugfix\/[0-9a-zA-Z-_.]+|[0-9a-fA-F]{7,40}|[0-9a-zA-Z-_./]+';
```

Alternation in JS is tried left to right: for a URL with a commit, `[0-9a-fA-F]{7,40}` matches
the SHA itself, and `filePath` gets the full path. The case of branches with `/`
in the name still relies on the DOM hint (a separate ambiguity that can't be resolved from a single
URL).

Verification: the class is covered by unit tests — first a failing test on a URL with a SHA and a deep
path (without `projectName` in it), then the regex fix, then `npm test`.

Affected file: `src/content/providers/gitlab/gitlab-url-parser.js`.

Related: the `projectName` heuristic in the primary regex (item 2) — a separate latent fragile
spot; a general audit of such spots is moved to [REFAC-0012].

### Followup

The SHA fix above is **pinpoint**: it closes only the blob-URL by a bare commit. The parsing
scheme itself remains guessing — the alternation is hardcoded on `master|develop|
feature/…|bugfix/…` and doesn't know about `main`, `release/*`, `hotfix/*` and any custom
branch names (for them the greedy catch-all will again fire and the path will be "pulled" into the ref). This is not
about the commit format, it's a patch for slash-in-branch-name, and it's fragile.

The reliable path (moved to [REFAC-0012], not done as part of BUG-0012):
- take `ref` from a **deterministic source** (the GitLab API / an explicit DOM attribute
  of the page), rather than guessing from the URL;
- if there's no way without a heuristic — **validate the invariant** of the result (ref must be
  a hex-SHA or an existing branch/tag, `filePath` non-empty) and **log explicitly**
  (`console.warn` with the input URL) on violation, so the cause is visible immediately, rather than
  inferred from the network log.

## Work log

<!-- Each AI session on the task is a separate entry. New entries on top. -->

- **Opus 4.8 · 2026-06-17 · fix/bug-0012-ref-path-merged-in-blob-url-parse** — Into the fallback alternation of
  `extractBranchCommitIdAndFilePath` an explicit hex-SHA pattern (`[0-9a-fA-F]{7,40}`) was added before the greedy
  catch-all (`gitlab-url-parser.js:128-130`). Now for a blob-URL by a commit with a deep path (without
  `projectName` in it and without a DOM hint) the ref matches the SHA exactly, and `filePath` gets the full path —
  the Search API receives a clean ref. A failing→green unit test was added. `npm test` — 765 pass. status=done.
