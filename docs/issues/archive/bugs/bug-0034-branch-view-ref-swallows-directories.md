---
id: BUG-0034
title: In branch view the ref swallows the directory path, so every ref-scoped lookup 404s
priority: high
status: done
---

## Statement

Opening a diagram from the repository (branch view, no merge request) parsed
`/-/blob/<ref>/<path>` at the wrong slash whenever the file was not in the
repository root: the ref came out as `main/order-service/src/main/resources/bpmn/order`
and the file path as the bare `OrderMain.bpmn`.

The diagram still rendered — `rawFileUrl(ref, filePath)` joins the two back with
a `/` and produces the correct URL — so the mis-parse was invisible until
something used the ref on its own. Everything that does then failed:

- dive-in into a Call Activity (blob search returns nothing, then the
  `ProcessFileIndex` fallback calls `/repository/tree?ref=…` and gets **404**);
- dive-out to the caller, `decisionRef` resolution, handler badges, correlation
  navigation — all ref-scoped blob searches, all silently empty;
- the version label in the differ header showed the glued ref verbatim.

Merge-request view was never affected: there the refs are commit shas from
`diff_refs`, and this parser is not involved.

## Context

`GitLabUrlParser.extractBranchCommitIdAndFilePath` guessed the ref from a
hardcoded alternation — `master|develop|feature/…|bugfix/…|<sha>|[0-9a-zA-Z-_./]+`.
A branch outside that list (`main`) fell through to the catch-all, which matches
slashes and is greedy, so it backtracked only to the *last* slash and left the
file name as the path. Branches named `master` worked; `main` did not. A file in
the repository root worked whatever the branch was called, because there is only
one slash to split on — which is why the previous test sandbox
(a single `test-1.bpmn` in the root) never showed
it.

Reported from the feedback report of a branch-view tab on
the test sandbox, which named the failing URL outright:
`…/search?scope=blobs&ref=main%2Forder-service%2Fsrc%2Fmain%2Fresources%2Fbpmn%2Forder&search=validateOrder`.
The params line in the same report showed `"targetRef":"main/ord"` — truncated by
`shortenCommitId`, which nearly hid the cause; fixed alongside (see the log
changes below).

Related: [FEAT-0033] added the sandbox's host; the new sandbox layout (diagrams
under `order-service/`, `billing-service/`) is what exposed this.

## Work log

### 2026-09-25 · claude-opus-5 · working tree (uncommitted)

Rewrote `extractBranchCommitIdAndFilePath` to stop guessing. It now splits the
blob-URL tail with an explicit ladder: the page's ref selector hint when it
actually prefixes the tail (the only source that can state a slashed ref), then a
commit-sha shape, then the first URL segment. The hardcoded branch-name list and
the project-name-anchored regex are gone, and the `projectName` parameter with
them (call site in `gitlab-repo-provider-base.js` updated). Each branch logs
which rule resolved the ref.

Known remaining gap, split out as [BUG-0035]: a slashed ref (`release/1.2`) still
needs the DOM hint, and that hint comes back empty on gitlab.com. Unslashed refs
no longer depend on it.

Log changes made in the same pass, all aimed at this class of bug:
- `console-log.js#describeDifferParams` shortens a ref only when it is sha-shaped,
  so a branch name is never truncated (`main/ord` is what hid this);
- `GitLabPlatformClient#searchCode` logs the hit count with the ref and term, so
  "nothing matches" and "the ref is wrong" stop looking identical;
- `loadFileContent` no longer repeats the URL three times in one error line.

Files: `src/content/providers/gitlab/gitlab-url-parser.js`,
`src/content/providers/gitlab/gitlab-repo-provider-base.js`,
`src/core/console-log.js`, `src/core/utils.js`,
`src/differ/platform/gitlab-platform-client.js`.
Tests: rewrote the parser's describe block (root-level, nested, non-listed branch
name, slashed ref via hint, ignored hint, sha, query+fragment, both null cases)
and added a ref-truncation case to `console-log.test.js`. `npm test` green
(1256).

Sandbox: `root-level.bpmn` added to the root of the test sandbox plus
MR !11 touching it, so the layout that used to work by accident stays covered
next to the nested diagrams.

Not committed: the working tree carries the change, the commit is the human's call.

### 2026-09-25 · claude-opus-5 · `dcfadfc` (branch `feature/handler-annotations-and-diff-button-fixes`)

Committed and opened as PR #4. The remaining slashed-ref case is [BUG-0035],
which is a different defect (a stale DOM selector), not unfinished work here.

Closed.
