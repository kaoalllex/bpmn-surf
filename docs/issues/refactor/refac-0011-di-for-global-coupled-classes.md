---
id: REFAC-0011
title: DI for classes coupled to fetch/localStorage/location — pay down the test debt
priority: low
status: open
---

## Statement

Several classes carry real logic but are coupled to globals
(`fetch`/`localStorage`/`sessionStorage`/`location`) directly, without injecting
collaborators — so they are not covered by unit tests and are listed in
`UNTESTED_BY_DESIGN` (`test/structure/source-layout.test.js`):

- `master-commit-manager.js` — `fetch` + `localStorage` + `DOMParser` + `Date.now()`
  inside methods; cache invalidation is bug-prone (cf. [BUG-0008]). It belongs to
  the "doomed" DOM path ([REFAC-0008]) — it may go away with it, in which case the test
  is not needed.
- key-building in `handler-navigator.js` / `call-activity-navigator.js`
  (`#getHandlerKey` and its analog) — pure logic for building a namespaced key from the BO,
  mirrors the already-covered `HandlerLocator`/`CallActivityLocator`, but it is private and
  coupled to the overlay/DOM.

A model to follow is `MergedMrCommitResolver`: all side-effect collaborators
(`loadContent`, `domScraper`, `masterCommitManager`) are injected through the
constructor, and the test does without `fetch`/`localStorage`.

Proposal: for the non-"doomed" classes, extract the side-effects into injectable
collaborators (or extract a pure key-building function), cover them with tests, and
remove the entry from `UNTESTED_BY_DESIGN`. Behavior does not change.

## Context

- `PageReloader` is already covered by a contract test on the retry counter
  (`test/content/page-reloader.test.js`) without refactoring — `location.reload`
  is a no-op in jsdom, and the observable counter in `sessionStorage` is checked.
- Related to [REFAC-0008] (removal of the DOM commit resolution) — it determines the fate of
  `MasterCommitManager`.
- The structural test `source-layout.test.js` ensures the `UNTESTED_BY_DESIGN`
  list does not go "stale": after adding a test, the entry must be removed from there.

## Work log
