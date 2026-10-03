---
id: BUG-0046
title: The differ tab spins forever when a file request times out
priority: high
status: done
---

## Statement

When the raw file request hung (`Timeout fetching …/-/raw/<sha>/OrderMain.bpmn after
10362 ms`), the differ tab kept its loading spinner forever. The console showed an
uncaught promise rejection from `BpmnDiffer.show`. Opening the diff again worked.

## Context

Reported live on gitlab.com, demo project `kao.alllex/bpmn-surf-demo`. `loadFileContent`
throws on a timeout or a dropped request. `DiagramVersions#loadXml` passed the error on,
and `BpmnDiffer.show` / `DmnDiffer.show` did not catch it. The loading overlay is hidden
only once a diagram or an empty state is shown, so it never went away.

## Work log

### 2026-10-03 · claude-opus-5-5 · branch `fix/differ-polish`

- `loadFileContent` retries a hung (`AbortError`) or dropped (`TypeError`) request once.
  An HTTP error status is an answer and is not retried.
- Both differs catch a failed version load and show "Could not load the file. Reload the
  tab to try again." in the empty-state slot, with Download disabled.
- `FakePlatformClient` got `httpRefs`, so a spec can drop a raw request with
  `page.route`. `differ-load-failure.spec.js` covers a retry that succeeds, a BPMN load
  that fails twice, and a DMN load that fails twice. It failed before the fix.
