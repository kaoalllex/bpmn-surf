# Search fallback link

Part of the `live-check` skill catalog; the prerequisites and rules are in its `SKILL.md`.

Every navigation locator that gives up (dive-in, callers, handler badges,
correlation) opens GitLab's code search. The URL format is pinned by unit tests;
only a live run shows GitLab still answers it ([BUG-0038]: it once 404'd).

```bash
node test/e2e/live/search-page.mjs --shots <scratchpad>/live
```

| The runner asserts | You check in the screenshots |
|---|---|
| 200 at a slash branch, the default branch and no ref; the sample file found only at its branch | a code-results page of the sandbox, not a sign-in or error page |

Run it with the signed-in profile. GitLab used to redirect a signed-out search to
sign-in. On 2026-10-03 a signed-out search scoped to the public demo project returned
code results, but the code search *API* still answered 401.
