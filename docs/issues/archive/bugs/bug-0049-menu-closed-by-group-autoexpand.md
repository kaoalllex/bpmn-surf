---
id: BUG-0049
title: The correlation and callers menus close on their own right after opening
priority: medium
status: done
---

## Statement

Selecting an element and opening its ✉→ correlation menu (or the ▾ callers menu)
quickly could close the menu the moment it appeared. CI caught it as a flaky
`differ-correlation-dropdown.spec.js`, red on master since 1.3.0 was merged.

## Context

On selection, `PropertiesGroupExpander` waits for each relevant properties-panel group
header to render and opens it with `groupHeader.click()`. On a slow machine that click
lands after the user opened the menu, and both menus close on any click outside them
through a capture-phase `document` listener, synthetic or not.

## Work log

### 2026-10-06 · claude-opus-5-5 · branch `fix/dmn-js-17.12.3`

- The outside-click handlers of `CorrelationNavigator` and `BackNavigator` ignore
  untrusted (script-dispatched) clicks. A real user click outside still closes the menu.
- Reproduced with a 6× CPU throttle: the original flow failed 5 of 10 runs, 10 of 10
  pass with the fix. New cases in `differ-correlation-dropdown.spec.js` and
  `differ-dive-out-menu.spec.js` dispatch a synthetic click while the menu is open; both
  failed before the change.
