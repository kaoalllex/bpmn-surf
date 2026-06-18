---
id: FEAT-0019
title: Handler navigation badge for execution/task listeners
priority: low
status: open
---

## Statement

BPMN elements can have **execution listeners** (`camunda:executionListener`)
and **task listeners** (`camunda:taskListener`) attached, implemented by a Java/Kotlin class
(`camunda:class`) or a delegate (`camunda:delegateExpression`). For these it is also useful to
show a handler-navigation badge — in the same spirit as for a service task
([FEAT-0003], [FEAT-0004]) and message events ([FEAT-0018]): a persistent colored badge
if the listener class is touched in the current MR, and navigation to the code on click.

A separate task (not part of [FEAT-0018]), because **the resolution core is shared, but the detection
and UI are fundamentally different** (see below).

## Context

### What is reused (the resolution core — unchanged)

The "class → handler code" link does not depend on the element type, so
`src/differ/navigation/handler-locator.js` does not need to change:

- `HandlerLocator.classKeyFromClassName` / `classKeyFromDelegateExpression` give the same
  key `class:<SimpleName>` for a `camunda:class` / `camunda:delegateExpression` listener;
- `findChangedHandlers` builds keys from the classes declared in the changed `.kt`/`.java`
  (`class <Name>`) → the listener class lands there automatically if it is in a scanned
  file;
- `resolveLocation`, `blobFileUrl`, `mrFileDiffUrl`, scanning the remote file on the target-ref —
  as is.

### Why this does NOT fit into [FEAT-0018] (detection + UI are different)

1. **1:N cardinality.** A service task / message event has one implementation → one
   overlay `</>` (`HandlerNavigator.#getHandlerKey` returns one key per element). For
   listeners — a **list** (`camunda:executionListener`/`taskListener`, each with its own
   `event` and class/delegate/script). An element may have several → the current
   "one key / one badge" model does not stretch.
2. **They attach to almost any element** — tasks, events, gateways, **sequence flow**, **the
   process itself**. A flow and the process have no anchor for an overlay badge, unlike a shape.
3. **Collision with the existing badge.** An element may be BOTH a service task with an implementation
   AND carry execution listeners at the same time — two different handlers on one shape.
4. **Only `class:` keys.** Listeners have no external `topic` (they are not `ExternalCapable`);
   `camunda:expression` and `camunda:script` are separate branches that we deliberately do not
   resolve (parity with a service task; expression — a method call, script — not a Java class).

### Where listeners live (camunda-moddle)

Under the element's `extensionElements`:

```
camunda:ExecutionListener  { event: 'start'|'end'|'take', class|delegateExpression|expression|script }
camunda:TaskListener       { event: 'create'|'assignment'|'complete'|'delete'|'timeout', class|delegateExpression|expression|script }
```

(task listener — only on `bpmn:UserTask`; execution listener — on a broad set of
elements and on `bpmn:Process`). Access: `bo.extensionElements.values` →
objects with `$type === 'camunda:ExecutionListener'` / `'camunda:TaskListener'`.

### Open UI questions (to resolve during the work)

- **Where to attach.** Options: (a) a multi-badge / stack of overlays on the shape (several `</>`
  in a row/column), (b) badges in the listeners group of the **properties panel** (listeners are
  already shown there, there is an anchor for each entry, no problem with flow/process), (c)
  a hybrid: an overlay counter on the shape + details in the properties panel. The properties panel looks
  more natural for 1:N and for elements without a convenient anchor.
- **Coexistence** with the service task/event handler badge on the same shape.
- **Color by diffType** for several classes at once (aggregate? show the worst / any
  affected one?).
- **Elements without a shape anchor** (sequence flow, process) — properties panel only.

### Tests

Extract the derivation of keys from listeners (`extensionElements` → set of `class:<Name>`) into a
pure function and cover it with unit tests on plain moddle mocks: one execution listener
with `class`; with `delegateExpression`; several listeners → several keys; a listener
with `script`/`expression` → skip; an element without `extensionElements` → empty.

### Links

- [FEAT-0003], [FEAT-0004] — namespaced key and navigation (shared core).
- [FEAT-0018] — badge for message events; shared `HandlerLocator`, but a 1:1 model.
- [FEAT-0015] — deep analysis of handler changes, adjacent.

### Affected files (expected)

- `src/differ/navigation/handler-navigator.js` or a new class — detecting listeners
  and the new UI (multi-badge / integration into the properties panel).
- possibly `src/differ/bpmn/properties-panel-highlighter.js` — if the badges go into the
  properties panel.
- `test/differ/navigation/*.test.js` — unit tests for the listener key derivation.
- `handler-locator.js` — **unchanged** (the resolution core is reused).

## Work log

<!-- Filled in while working on the task; freshest entries on top. -->
