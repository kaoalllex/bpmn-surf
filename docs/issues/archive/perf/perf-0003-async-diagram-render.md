---
id: PERF-0003
title: Show the schema immediately, load changed handlers in the background
priority: high
status: done
---

## Statement

On the differ page, between opening it and the diagram appearing, there is a noticeable delay (on large MRs — seconds). The reason: loading the changed handlers blocks the initial render. We need to show the schema immediately, and load the highlighting of changed delegates/handlers asynchronously (and preferably — with parallel requests instead of sequential ones).

## Context

The flow in `bpmn-differ.js#show()`:

```
await #loadVersions()        // XML of two versions — fast
await #loadChangedHandlers() // BLOCKS: ~30+ .kt files one by one
await #showMr()/#showBranch()// only now the render
#view.showCanvas()           // only now the schema is visible
// "ready!"
```

- `#loadChangedHandlers()` — `src/differ/bpmn/bpmn-differ.js` (called before `#showMr()`).
- `findChangedHandlers()` — `src/differ/navigation/handler-locator.js`: after `GET /merge_requests/{iid}/changes` there is a **sequential** loop over the changed `.kt`/`.java` files, each one a separate `loadFileContent` (logs `changed handler files (N)` → `changed handler keys (M)`).
- The highlighting is updated in `#showXml()` → `refreshChangedBadges()` on every XML import, i.e. it works correctly even if the handlers arrive after the render.

Direction of the solution:
- move `#loadChangedHandlers()` out of the blocking path — the schema render and `showCanvas()` earlier, the handler loading in the background (`.catch(...)`), and once ready — `setChangedHandlers()` + refresh the badges;
- parallelize the per-file loading in `handler-locator.js` (instead of the sequential loop);
- check both differs (BPMN and DMN use the shared differ-page classes).

Symptom log: on an MR with 30 changed files, `ready!` arrives ~5 s after `loading branch bpmn xml...`, and the screen stays empty all that time.

Links: [PERF-0002] (fewer redraws/cache), [PERF-0001] (network interaction). A loading indicator as a UX safeguard during resolution/render — [UX-0008].

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-06-16 · claude-opus-4-8 · branch `perf/async-changed-handlers`

Removed the loading of changed handlers from the blocking path of the initial render and parallelized the per-file loading.

- `bpmn-differ.js#show()`: `#loadChangedHandlers()` is no longer `await`-ed — the schema is rendered and `showCanvas()` is called immediately, the handler scan runs in the background.
- `#loadChangedHandlers()`: after `setChangedHandlers()` a call to `refreshChangedBadges()` was added — the badges are loaded onto the already-rendered diagram. The race is covered from both sides: if the scan finishes before the import, `#showXml()` itself will place the badges.
- `handler-locator.js#findChangedHandlers()`: the sequential loop over `.kt/.java` was replaced with a parallel `Promise.all`; the keys are collected in the original order (determinism on key collision is preserved).
- The DMN differ does not use handlers — verified, no changes required.
- `npm test` — 657 passed.
