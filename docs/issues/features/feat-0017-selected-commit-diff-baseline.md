---
id: FEAT-0017
title: Investigation — comparison baseline and the "Original" label when an MR commit is selected
priority: low
status: open
---

## Statement

In selected-MR-commit mode (`?commit_id=`, FEAT-0001) the "Original" side = the parent
of the selected commit specifically (`parent_ids[0]`). For a file that **first appeared inside the MR**,
this gives a different "original" depending on the opened commit and can be confusing:

- the **first** MR commit is opened → the parent is pre-MR → the file is absent → correctly "added";
- the **last** MR commit is opened → the parent is the previous MR commit (the file is already there) →
  an incremental diff, not "file added in the MR".

The behavior is **correct** (GitLab behaves the same way in a single-commit diff) and
matches the FEAT-0001 specification. The cumulative view "what the MR does to the file as a whole"
**is already available** — it is the overall MR diff (the `/diffs` page without a selected commit): there
`target = merge-base`, and the new file is shown as added.

The task is not to "fix" (there is no bug) but to decide whether reducing the confusion is needed and how.

## Context

- Example: MR https://gitlab.example.com/example-group/example-service/-/merge_requests/3931 ,
  file `pllOfferSigning.bpmn` (first appeared in the MR; the MR is merged). Opening the first
  commit `d72d870a` → "no original"; opening the last `e644ef1f` → `Original ·
  …(60bd4b11)` (the previous MR commit). The diff itself is correct — the question is about the meaning/label.
- Code: `gitlab-api-repo-provider.js` (`getSourceCommitId`/`getTargetCommitId`/`getDiffSideLabels`),
  `branch-indicator.js` (the `Original`/`Changed` role), `differ-params.js`. Related to
  [FEAT-0001] (selected-commit diff) and [FEAT-0009] (side labels, role).

### Observed corner cases (account for during the work)

1. **The `Original` label of the first commit** = the commit from the target branch (the branch point).
   If the file is there (not new), the label will show the message of an unrelated master commit
   as "Original" — formally correct, but it may be confusing.
2. **A merge commit as the selected one** — only the first parent is taken (`parent_ids[0]`),
   the diff against it may be unexpected.
3. **Fallback to `base_sha`** (root commit / parent-resolution error) — then "Original"
   suddenly becomes the MR base rather than the previous commit, without an explicit indication.

### Possible directions (choose during the work)

- **A. Clearer label.** In selected-commit mode, explicitly mark that Original is the
  previous MR commit (and not the MR base / target branch). A small change, no logic change.
- **B. Comparison-baseline option.** Provide a toggle "against the commit's parent" ↔ "against the
  MR base" for the selected file. Larger; partially duplicates the overall MR diff.
- **C. Change nothing, document.** Fix it down: a commit is selected → diff against the
  previous commit; the whole MR → against the MR base.

## Work log

<!-- Each AI session on the task is a separate entry per the template below.
     Add new entries at the top (freshest first). -->

### 2026-06-16 · claude-opus-4-8 · branch `feature/branch-name-not-hash`

Task created following the discussion within FEAT-0009. Verified on MR 3931: the resolution
logic (`source = selected commit`, `target = parent_ids[0]`) and labels are correct, the diff
itself is correct — the discrepancy is only in expectations ("Original" = the previous commit, not the MR
base). The corner cases and directions A/B/C are recorded. No code changes were made.
