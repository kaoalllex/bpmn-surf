---
id: FEAT-0004
title: Open a tab with the delegate code
priority: medium
status: done
---

## Statement

On clicking a service task, open the delegate code from the currently selected branch (master or MR).

## Context

- Related to [FEAT-0003].
- Delegates/Java — see [FEAT-0003].
- Done: opening the code for classic delegates (`camunda:class`/`delegateExpression`) and Java handlers — through the locator shared with FEAT-0003 (resolution — `resolveLocation(key, ref)` → `#searchClassDeclarationLocation`). Implementation details — in [FEAT-0003], the "Refinement plan" section and the Work log.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-06-15 · claude-opus-4-8 · (branch `feature/delegate-change-highlight`)

Opening delegate code was implemented together with the highlighting [FEAT-0003] on the shared namespaced key. Clicking a delegate badge (`camunda:class` / `delegateExpression="${bean}"`, Kotlin and Java) opens: for a handler changed in the MR — its diff in the MR; for an unchanged one — the class declaration on the currently shown version (resolution `resolveLocation('class:<Name>', ref)` → `#searchClassDeclarationLocation` — search `class <Name>` in the handler file without requiring an annotation), and on failure — a fallback to the GitLab search page (the term from the key via `termFromKey`). External task — without regression. Details and limitations — in the Work log of [FEAT-0003].

### 2026-06-14 · — · (branch `feature/delegate-change-highlight`)

Done for an external task in Kotlin: clicking the overlay badge opens the handler. For a handler changed in this MR — its diff in the MR (anchor by the SHA-1 of the file path), and the navigation reuses the already-open source MR tab (`window.opener`) by switching to it (`window.open(url, name)` via the opener's temporary `window.name` — `opener.focus()` in Chrome does not reliably switch the tab), rather than creating a new one (fallback to a new tab if the opener is closed); for the rest — the code on the currently shown version in a new tab (resolution "topic → file:line" via the GitLab project blob-search API `handler-locator.js#resolveLocation`, and on failure — a fallback to the GitLab search page). Works in both MR and branch mode.

Verified: project blob-search on `gitlab.example.com` is available (basic search, no Elasticsearch; the `ref` parameter works) — the main resolution path is valid, the UI-search fallback remains a safeguard.
