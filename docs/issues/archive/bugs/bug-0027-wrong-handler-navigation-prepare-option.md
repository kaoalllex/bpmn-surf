---
id: BUG-0027
title: Wrong handler navigation on PrepareItem.bpmn
priority: medium
status: done
---

## Statement

When navigating the `PrepareItem.bpmn` diagram, navigation to the handler for step
`Order_PrepareItem_FindItems` is incorrect — it opens the handler for a
different step (`Order_PrepareItem_FindItemsInCatalog`).

## Context

- Diagram: `PrepareItem.bpmn`, opened in repository blob view on the default branch
- Expected: clicking on step `Order_PrepareItem_FindItems` → navigate to
  its handler (`FindItemsTask.kt`).
- Actual: navigates to handler for step
  `Order_PrepareItem_FindItemsInCatalog` (`FindItemsInCatalogTask.kt`).
- Affected code: `handler-locator.js` (methods `#searchSubscriptionLocation` and `#searchClassLocation`).

## Root Cause Analysis

The GitLab search API returns multiple results for the topic search:

```json
[
  {
    "path": "order/item/src/main/kotlin/prepare/FindItemsInCatalogTask.kt",
    "snippet": "@ExternalTaskSubscription(\"Order_PrepareItem_FindItemsInCatalog\")"
  },
  {
    "path": "order/item/src/main/kotlin/prepare/FindItemsTask.kt",
    "snippet": "@ExternalTaskSubscription(\"Order_PrepareItem_FindItems\")"
  }
]
```

The bug had **two root causes**:

### 1. Primary cause: `.find()` returns the first annotated file (BUG-0027)

The code used `.find()` to get the first annotated file:
```javascript
const annotated = handlerItems.find(i => i.snippet && i.snippet.includes('ExternalTaskSubscription'));
const candidates = annotated ? [annotated] : handlerItems;
```

This always selected `FindItemsInCatalogTask.kt` (first in the list), even though
`FindItemsTask.kt` was also annotated and was the correct match.

### 2. Secondary issue: regex for exact matching had flawed quote handling

The initial `matchesExactTopic` regex `["']?${topic}["']?(?![A-Za-z0-9_])` had independent
optional quotes, which could match an opening quote without requiring a closing quote.

## Fix

### Fix 1: Use `.filter()` to get ALL annotated items, not `.find()` for the first

```javascript
// Before (wrong):
const annotated = handlerItems.find(i => ...);
const candidates = annotated ? [annotated] : handlerItems;

// After (correct):
const annotatedItems = handlerItems.filter(i => i.snippet && i.snippet.includes('ExternalTaskSubscription'));
const candidates = annotatedItems.length > 0 ? annotatedItems : handlerItems;
```

This fix was applied to **both** methods:
- `#searchSubscriptionLocation` — for topic-based handler search
- `#searchClassLocation` — for class-name-based handler search (used by `a class-name annotation`)

### Fix 2: Improve `matchesExactTopic` and `matchesExactClassName` regexes

```javascript
static matchesExactTopic(snippet, topic) {
    // Match the topic inside matching quotes: "topic" or 'topic'
    // Using backreference \1 to ensure closing quote matches opening quote.
    const quotedRegex = new RegExp(`(["'])${topic}\\1`);
    if (quotedRegex.test(snippet)) {
        return true;
    }
    // Fallback: unquoted topic with word boundaries (for bare search results)
    const unquotedRegex = new RegExp(`\\b${topic}\\b`);
    return unquotedRegex.test(snippet);
}

static matchesExactClassName(snippet, className) {
    // Word boundary after the class name: not followed by [A-Za-z0-9_]
    const regex = new RegExp(`\\bclass\\s+${className}(?![A-Za-z0-9_])`);
    return regex.test(snippet);
}
```

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-07-07 — Complete fix applied and verified

**Final root cause identified:** The primary issue was using `.find()` instead of `.filter()`
to get annotated items. This caused the code to always select the **first** annotated file
in the search results, regardless of whether it was the correct match.

**Changes made:**
1. Fixed `#searchSubscriptionLocation` to use `.filter()` for all annotated items
2. Fixed `#searchClassLocation` with the same pattern (for `a class-name annotation` handlers)
3. Improved `matchesExactTopic()` regex to use paired quotes with backreference
4. Added `matchesExactClassName()` for exact class name matching

**Tests added:**
- 6 integration tests in `HandlerLocator with real GitLab search results (BUG-0027)`
- 1 regression test for `searchSubscriptionLocation` with multiple annotated files
- 1 regression test for `searchClassLocation` with multiple `a class-name annotation` classes
- 7 unit tests for `matchesExactTopic()` and `matchesExactClassName()`

**Verification:**
- ✅ 1081 unit tests pass
- ✅ 96 e2e tests pass
- ✅ Manual testing confirms correct handler opens for `Order_PrepareItem_FindItems`

### 2026-07-07 — Initial fix attempt (FAILED)

Attempted to fix by adding `matchesExactTopic()` and `matchesExactClassName()` methods
with regex-based exact matching. The fix was merged but **did not resolve the issue**.

The regex `["']?${topic}["']?(?![A-Za-z0-9_])` does not correctly match quoted topics
because the optional quotes are independent — it can match an opening quote without
requiring a closing quote.

**Next step:** Fix the regex to properly match quoted strings.
