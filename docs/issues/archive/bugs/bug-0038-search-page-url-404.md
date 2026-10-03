---
id: BUG-0038
title: The "search in the repository" fallback link 404s
priority: high
status: in-progress
---

## Statement

Every locator that fails to resolve something offers a code-search page as the
honest fallback — "we could not tell, here is the search". That link was built as
`<project>/-/search?search=…&scope=blobs&ref=…`, and GitLab answers **404** to it.

So the fallback, which exists precisely for the cases where automatic resolution
gives up, led nowhere.

## Context

Reported from a branch-view session on `Payment.bpmn`: clicking through to the
handler of topic `chargeCustomerWithRetry` ended on a 404 page. The log showed the
resolution itself behaving correctly —

```
blob search for 'chargeCustomerWithRetry' at ref 'main': 1 hit(s)
handler source not found for topic 'chargeCustomerWithRetry'
```

— one hit, the diagram itself, no handler file among them, so the locator
correctly declined to guess and opened the fallback. The 404 was the fallback.

Measured as a signed-in user (anonymously the same URL merely redirects to
sign-in, which is why this needed a real session):

| URL | result |
|-----|--------|
| `<project>/-/search?search=…&scope=blobs&ref=main` | **404 Not Found** |
| `<project>/-/search?search=…&scope=blobs` | **404 Not Found** |
| `<host>/search?search=…&project_id=<id>&scope=blobs` | 200, scoped to the project |
| …`&repository_ref=main` | 200, ref accepted |

Affects every caller of `GitLabPlatformClient#searchPageUrl`: `CallActivityLocator`,
`DecisionLocator`, `CallerLocator`, `HandlerLocator` and the correlation panel's
raw-search link.

## Work log

### 2026-09-25 · claude-opus-5 · working tree

`searchPageUrl` now builds `<host>/search` with `project_id` and `repository_ref`,
via `URLSearchParams`. Verified live with a quoted term containing a space
(`process id="DunningProcess"`): 200, scoped to the project, one code hit.

Unit tests updated, plus one pinning that the ref is omitted when there is none.
