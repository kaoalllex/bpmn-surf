---
id: BUG-0027
title: Wrong handler navigation on PrepareItem.bpmn
priority: medium
status: open
---

## Statement

When navigating the `PrepareItem.bpmn` diagram, navigation to the handler for step
`Order_PrepareItem_FindItems` is incorrect — it opens the handler for a
different step (`Order_PrepareItem_FindItemsInCatalog`).

## Context

- Diagram: `PrepareItem.bpmn`
  https://gitlab.example.com/example-project/example-repo/-/blob/master/order/item/src/main/resources/bpmn/prepare/PrepareItem.bpmn
- Expected: clicking on step `Order_PrepareItem_FindItems` → navigate to
  its handler.
- Actual: navigates to handler for step
  `Order_PrepareItem_FindItemsInCatalog`.
- Affected code: `call-activity-navigator.js`, `call-activity-locator.js` (handler
  search and navigation logic for CallActivity).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
