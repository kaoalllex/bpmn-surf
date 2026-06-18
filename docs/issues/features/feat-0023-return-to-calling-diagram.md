---
id: FEAT-0023
title: Return to the calling diagram from a called diagram (back navigation)
priority: medium
status: open
---

## Statement

When the user dives into a called diagram (call activity → called process, or a
called DMN), there is currently no way to go back to the diagram they came from.
Add a "back" navigation that returns to the calling diagram, restoring its state
(viewport/selection if feasible) and, ideally, the element that was dived into.

A breadcrumb / navigation stack is the natural model: each dive pushes the
calling diagram onto a stack, "back" pops it. Support multiple levels of nesting
(A calls B calls C → back from C returns to B, then to A).

## Context

- Complements the existing dive-in flow into call activities and the called DMN
  navigation ([FEAT-0005]).
- Related: [UX-0008] (loading indicator while a call activity is being opened),
  [BUG-0006] (resolving the call-activity target file by process id).
- Open question: scope — is back-navigation only within a single dive session
  (in-memory stack), or should it survive SPA navigation / reload?
- Part of the broader shift toward schema browsing/exploration as a first-class
  use case (not only MR diff).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries at the top (most recent first). -->
