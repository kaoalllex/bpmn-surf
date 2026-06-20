---
id: BUG-0017
title: Diving into an already-open called diagram opens a duplicate tab
priority: medium
status: done
---

## Statement

Follow-up to [FEAT-0023] (dive-out / caller navigation). Diving into a called
diagram always opened a fresh tab, even when that exact diagram was already open
in a tab above us in the navigation chain.

Reproduction (A and B both call C):

1. On **A**, dive into **C** (⤵) → tab C opens. *(correct)*
2. On **C**, open the callers menu (▾) and pick caller **B** → tab B opens, C
   stays open. *(correct)*
3. On **B**, find a step that calls **C** and dive in (⤵) → a **second** tab C
   opens (duplicate). *(bug — should focus the existing C tab instead)*

## Context

- Each diagram diff has a stable identity = refs (project + MR/branch versions) +
  file path. Two tabs with the same identity are duplicates.
- The user's expectation: *whatever* path led here — diving in, stepping up to a
  caller, or a tab opened independently — if a tab for that diagram is already
  open, no second one should appear. So the dedup must be global across tabs, not
  limited to the `window.opener` chain (which only sees ancestors and misses
  "sibling" tabs, e.g. A and B opened independently from the MR file list, each
  navigating to C).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-06-20 · claude-opus-4-8 · branch `fix/duplicate-tab-on-dive-in`

Cross-tab dedup via a `BroadcastChannel` registry (replaced an initial
opener-chain-only attempt, which could not see sibling tabs).

- **`differ-params.js`** — `identityKey()` / `identityKeyFor(params, filePath)`:
  the stable identity (project + MR/branch refs + file path). The key a tab
  computes for a navigation target equals the key the freshly opened nested tab
  publishes (nested differs share all refs, differ only by file path).
- **`differ-tab-navigator.js`** — `registerTab(key)`: joins a `BroadcastChannel`
  (`gl-bpmn-diff-tab-registry`), takes a stable identity-derived `window.name`,
  and answers "who shows this diagram?" queries. `focusExistingDifferTab(key)`:
  broadcasts the query, and if any OPEN tab answers within `QUERY_TIMEOUT_MS`
  (150 ms) brings it to the front via `window.open('', name)` and returns true;
  otherwise false (open a fresh tab). Only open tabs answer, so a closed tab is
  never matched (no stale entries); BroadcastChannel does not echo to the sender,
  so a tab never matches itself. Channel/focus/timeout are injectable for tests;
  with no `BroadcastChannel` the registry no-ops (falls back to always opening).
- **`bpmn-differ.js` / `dmn-differ.js`** — `registerTab` on init; the shared
  `#openDifferForFile` first tries `focusExistingDifferTab` and only opens a new
  tab on no match, so BOTH dive-in and dive-out (open a caller) reuse an open tab.
- Tests: `differ-tab-navigator.test.js` (registry over an in-memory channel bus:
  sibling reuse, closed-tab miss, no-self-match, concurrent askers, unsupported
  channel), identity-key cases in `differ-params.test.js`; `differ-tab-navigator.js`
  registered in `test/support/scope.js` and removed from the untested-by-design
  list. `npm test` green (882).

**Trade-off:** diving out to a caller that is already open reuses that tab and so
does not re-highlight its call site (`selectCalledProcessIds`) — avoiding the
duplicate was preferred per the user. Restoring the highlight on reuse is tracked
as [FEAT-0025].

**Needs manual in-browser check before merge:** that `BroadcastChannel` and the
`window.open('', name)` focus-by-name actually reach sibling differ tabs on a real
Chrome instance (the unit tests use an in-memory channel, not the browser).
