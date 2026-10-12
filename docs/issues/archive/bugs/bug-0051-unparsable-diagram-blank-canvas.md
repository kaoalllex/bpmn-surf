---
id: BUG-0051
title: A diagram that does not parse opens as a blank canvas with no message
priority: low
status: done
---

## Statement

When the XML of the shown side fails to import (e.g. a file truncated mid-text-node),
the differ logs `bpmn schema loading error` to the console and shows an empty canvas with
"Changed: 0 / Added: 0". The user gets no sign that the file is broken rather than
unchanged. A fetch failure already says so through `DifferEmptyState`
(`differ-load-failure.spec.js`); an import failure should say so too.

## Context

- Found by the live check of 2026-10-11: GitHub sandbox PR `#10` (`fix/broken-schema`,
  `broken/TruncatedDocumentation.bpmn`), signed in and anonymous; the GitLab twin is the
  sandbox's closed `fix/broken-schema` MR. The behavior is the same on master.
- `BpmnDiffer#importXml` (`src/differ/bpmn/bpmn-differ.js`) catches the error and returns;
  the DMN twin is `DmnDiffer` (`dmn loading error`, `src/differ/dmn/dmn-differ.js`).
- The empty state: `src/differ/shared/differ-empty-state.js`.

## Work log

### 2026-10-12 · claude-opus-5-5 · branch `fix/bug-0051-unparsable-diagram`

A side whose import fails now shows "This file is not a valid diagram and cannot be shown."
in `DifferEmptyState`. BPMN: `#importXml`/`#showXml` report the failure, the stale previous
diagram and its changes are cleared (`#clearDiagram`, shared with `#showAbsentSide`), the
diff is not painted, Highlight/✎ are disabled; the cover is hidden again on the next
successful import or absent side (new `BpmnDifferView#hideEmptyState`). DMN: the same message
from `#showXml`'s catch. E2E cases in `differ-load-failure.spec.js`.
