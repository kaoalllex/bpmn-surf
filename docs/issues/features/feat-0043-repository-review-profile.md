---
id: FEAT-0043
title: Review profile shared from the repository
priority: low
status: open
---

## Statement

With [FEAT-0040] and [FEAT-0042], every reviewer has their own profile, so two reviewers
can see the same merge request differently. A team wants one profile, versioned and
reviewed like code. A repository can hold a review profile file; when a diff is opened, its
rules and levels apply on top of the built-in defaults, and the user's own overrides apply
on top of it, unless the file forbids weakening a rule.

Requirements:

1. One file at a fixed repository-root path (e.g. `.bpmn-surf/review-profile.json`), in the
   export format of [FEAT-0042].
2. **The file is read from the base side of the comparison, at an immutable revision**, so a
   merge request cannot weaken the rules it is reviewed with. The revision used is shown.
3. Precedence: built-in defaults < repository profile < user overrides; a rule the
   repository marks as enforced cannot be lowered or switched off by a user override or by a
   colliding custom rule id.
4. "No file", "unreadable" (denied, network error) and "invalid" are distinct, visible
   states; none of them silently looks like a clean result.
5. A local comparison or a single-file view with no base revision applies no repository
   profile and says so.

Out of scope: profiles per directory; fetching a profile from anywhere other than the
repository under review.

## Context

The "base side" is not simply the target branch tip:

- GitHub compares against the merge base (`src/content/providers/github/github-repo-provider-base.js`).
- GitLab uses the merge request diff base, or — for a single-commit comparison — that commit's
  parent, which may already contain a rule edit from an earlier commit of the same merge
  request (`src/content/providers/gitlab/gitlab-api-repo-provider.js`).
- A moving branch tip would make the same reviewed pair produce different findings.

Files are loaded the way the diagrams are (`DiagramVersions` over
`platformClient.rawFileUrl`), from the user's own host only.

Open questions: the exact path; whether a trusted base update applies to reviews already
open; whether the single-commit GitLab case should use the merge request base instead.

Acceptance: a fork PR; base and head disagreeing (head weakens a rule → base wins); the
target tip moving after the review opened; 404 vs access denied; a GitLab single-commit view
whose parent already weakened a rule; a local comparison.

## Work log

<!-- Each AI session on the task — a separate entry by the template below.
     Add new entries on top (freshest first). -->
