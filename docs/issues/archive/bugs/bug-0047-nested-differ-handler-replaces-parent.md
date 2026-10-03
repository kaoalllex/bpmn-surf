---
id: BUG-0047
title: A changed handler opened from a nested differ replaces the parent differ tab
priority: medium
status: done
---

## Statement

The scenario: dive into a call activity (for example Payment from OrderMain) in an MR
diff, then click the blue `</>` badge of a handler changed in the MR. The handler's MR
diff opened in the parent differ tab, which lost its diagram. The MR tab was left
untouched. Expected: the MR tab shows the file diff, and the differ tabs stay as they
are.

## Context

`DifferTabNavigator#navigateOpenerTab` navigated `window.opener`. For a differ opened by
dive-in, the opener is the differ it came from. Found live on the demo project while
planning the store media.

## Work log

### 2026-10-04 · claude-opus-5-5 · branch `fix/nested-handler-opener`

- `navigateOpenerTab` now walks the opener chain past differ tabs (the about:blank pages
  `openDiffer` creates) to the originating GitLab tab. When no such tab is left, it
  returns false and the caller opens a new tab, as before.
- Unit tests cover the direct opener, a parent differ in between, and only differs
  above. The last two failed without the fix.
- Checked live on the demo: OrderMain → ⤵ Payment → blue `</>` on "Charge the
  customer" navigates the MR tab, and the OrderMain differ keeps its diagram.
