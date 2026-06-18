---
id: FEAT-0018
title: Handler-navigation badge for a message end event
priority: medium
status: done
---

## Statement

On **message end event** elements (a terminating message event) an implementation
can also be set (`camunda:class` / `camunda:delegateExpression` /
external task `camunda:type="external"` + `camunda:topic`). For them we need to show
a badge to navigate to the handler code — exactly the way it currently works for a **service
task** (overlay `</>`, see [FEAT-0003], [FEAT-0004]):

- a permanent colored badge if the handler is affected in the current MR (green/blue/red);
- a neutral badge on element selection — for the rest;
- a click opens the handler diff in the MR (for affected ones) or the code on the shown version.

## Context

### Why a service task works, but a message end event does not

The implementation attributes in camunda-moddle are defined via `camunda:ServiceTaskLike`
and `camunda:ExternalCapable` (`libs/camunda-bpmn-moddle/resources/camunda.json`):

```
ServiceTaskLike  extends [bpmn:ServiceTask, bpmn:BusinessRuleTask, bpmn:SendTask, bpmn:MessageEventDefinition]
  → expression, class, delegateExpression, resultVariable
ExternalCapable  extends [camunda:ServiceTaskLike]
  → type, topic
```

The key fact: **`bpmn:MessageEventDefinition` is the same `ServiceTaskLike` as a
service task.** That is, the set of attributes (`class`/`delegateExpression`/`type`/`topic`)
of a message event is identical to a service task's. The only difference is **where** they live:

- for a service task — directly on `elem.businessObject`;
- for a message end event — on the **nested** `bpmn:MessageEventDefinition`, i.e. on
  `elem.businessObject.eventDefinitions[i]` (where `$type === 'bpmn:MessageEventDefinition'`),
  not on the event's BO itself.

The current code reads the attributes only from the BO itself and therefore returns `null` for events.

### Where the change is (a single point of change)

`src/differ/navigation/handler-navigator.js`, the private method `#getHandlerKey(elem)`
(lines ~97–114). Currently:

```js
#getHandlerKey(elem) {
    const bo = elem && elem.businessObject;
    if (!bo) return null;
    if (bo.type === 'external' && bo.topic) return `topic:${bo.topic}`;
    const delegateExpression = bo.get && bo.get('camunda:delegateExpression');
    if (delegateExpression) return HandlerLocator.classKeyFromDelegateExpression(delegateExpression);
    const className = bo.get && bo.get('camunda:class');
    if (className) return HandlerLocator.classKeyFromClassName(className);
    return null;
}
```

We need the attributes to be read from the "implementation holder": for a service task — the BO itself,
for an event with a `bpmn:MessageEventDefinition` — that nested moddle object. Sketch:

```js
#getHandlerKey(elem) {
    const bo = elem && elem.businessObject;
    if (!bo) return null;
    const impl = HandlerNavigator.#implementationHolder(bo); // BO or its messageEventDefinition
    if (!impl) return null;
    if (impl.type === 'external' && impl.topic) return `topic:${impl.topic}`;
    const delegateExpression = impl.get && impl.get('camunda:delegateExpression');
    if (delegateExpression) return HandlerLocator.classKeyFromDelegateExpression(delegateExpression);
    const className = impl.get && impl.get('camunda:class');
    if (className) return HandlerLocator.classKeyFromClassName(className);
    return null;
}

// BO as is; if it has a bpmn:MessageEventDefinition — return it.
static #implementationHolder(bo) {
    const defs = bo.eventDefinitions || (bo.get && bo.get('eventDefinitions'));
    const msgDef = defs && defs.find(d => d.$type === 'bpmn:MessageEventDefinition');
    return msgDef || bo;
}
```

`bo.type` / `bo.topic` are read as plain properties (camunda-moddle defines them under
the names `type`/`topic`); there is no collision with `$type` — moddle always keeps the element type in `$type`.

### What does NOT need to change

- **`handler-locator.js`** — no changes. `findChangedHandlers`/`resolveLocation`
  work by the string key (`topic:<topic>` | `class:<Name>`) extracted from
  the handler code and do not depend on the type of the BPMN element. As soon as `#getHandlerKey`
  returns the correct key for an event — both the permanent colored badge (match by
  `#changedHandlers`), and the badge-on-selection, and the click navigation will work "for free".
- **`refreshChangedBadges` / `showOverlayForSelectedElement`** — no changes
  (they already traverse all registry elements and call `#getHandlerKey`).
- **CSS / badge text / overlay positioning** — the same (`.handler-link`,
  `position: { bottom: 0, right: 0 }`).

### Corner cases (to account for and/or verify)

1. **Implementation on the nested `messageEventDefinition`, not on the BO** — the main
   reason for the task; solved by `#implementationHolder`.
2. **Several `eventDefinitions`** — select exactly `bpmn:MessageEventDefinition`
   by `$type` (not `[0]`); other types (timer/signal/error/escalation/conditional)
   do not carry class/delegate and should yield `null`.
3. **`camunda:expression`** (e.g. `${bean.method()}`) is deliberately NOT handled —
   parity with service task (this is a method call, not a class). Do not add.
4. **External task on an event**: `camunda:type="external"` + `camunda:topic` live on
   the `messageEventDefinition` — the same `impl.type === 'external'` branch.
5. **Normalization / resolution** (`classKeyFromClassName`, `classKeyFromDelegateExpression`,
   `simpleClassName`, rejection of complex delegate expressions, simple-name collisions,
   scan of a removed handler on the target ref) — reused as is, nothing to duplicate.
6. **Visual check**: an end event is a small circle; make sure the overlay `</>`
   in the bottom-right corner is readable and does not overlap the diff marker.

### Scope (decided — extended)

We handle **any event with a `bpmn:MessageEventDefinition` that carries an implementation**,
not only a literal message **end** event. The same moddle holder applies to a
**message intermediate throw event** (structurally identical to an end event), and the approach
`#implementationHolder` + a gate by the presence of an attribute (not by the event subtype) covers
both in one line with no extra risk: message start/catch/boundary events do not have these
attributes and will yield `null`. We do NOT add a filter by `bo.$type === 'bpmn:EndEvent'`.

### The full family of implementation holders (camunda-moddle)

The attributes `class`/`delegateExpression`/`expression` + external `type`/`topic` are defined
on exactly one family — `camunda:ServiceTaskLike` (+ `camunda:ExternalCapable`):

| Element | Holder | Status |
|---|---|---|
| `bpmn:ServiceTask` | the BO itself | works |
| `bpmn:SendTask` | the BO itself | **already works** with the current `#getHandlerKey` (attributes on the BO, no nesting) |
| `bpmn:BusinessRuleTask` | the BO itself | works the same way; its `camunda:decisionRef` is DMN ([FEAT-0005]), not a code handler |
| `bpmn:MessageEventDefinition` | a nested def inside the event | **this task** — host: message **end event** + message **intermediate throw event** |

Send task and business rule task require no changes (attributes directly on the BO). Therefore
the refinement is needed only for events — the only case with a nested holder.
If possible, also add regression tests for send/business-rule tasks, since they are formally
in the same family and are currently uncovered.

> Out of scope (they reference code, but a different mechanism/UX — separate tasks if
> needed): `camunda:ExecutionListener`/`camunda:TaskListener`
> (`class`/`delegateExpression`/`expression`/`script` via `extensionElements`,
> many-per-element), `camunda:Connector` (`connectorId`), `camunda:Field`.
> Not handlers at all: `bpmn:ScriptTask`/`Script` (a script), `FormProperty`/`FormField`
> (forms), `ErrorEventDefinition.expression` (the error code).

### Tests

Currently `#getHandlerKey` is private and not covered by tests (there are only
`test/differ/navigation/handler-locator.test.js` on the locator's static methods).
To follow the project's style (many small tests on the public API, precise localization of
the breakage), extract the key derivation into a **pure testable function** (e.g.
`HandlerLocator.handlerKeyFromBusinessObject(bo)` or a separate static helper),
accepting a BO-like object, and test it on plain moddle mocks:

- service task with `camunda:class` → `class:<Name>` (regression, didn't break it);
- service task external (`type/topic`) → `topic:<topic>` (regression);
- message end event with `messageEventDefinition.camunda:class` → `class:<Name>`;
- message end event with `delegateExpression` → `class:<Bean>`;
- message end event external → `topic:<topic>`;
- message end event without implementation → `null`;
- end event with a timer/signal definition (not message) → `null`;
- event without `eventDefinitions` → `null`.

### Links

- [FEAT-0003] — the namespaced handler key and colored highlighting by diffType (base).
- [FEAT-0004] — opening the handler code on click (base).
- [FEAT-0015] — deep analysis of handler changes (transitive dependencies), adjacent.

### Affected files (expected)

- `src/differ/navigation/handler-navigator.js` — extend `#getHandlerKey`
  (+ extract a pure key-derivation helper).
- possibly `src/differ/navigation/handler-locator.js` — if the key-derivation helper
  is more logically placed next to the locator's static methods.
- `test/differ/navigation/*.test.js` — unit tests for the key derivation.

## Work log

<!-- Filled in while working on the task; recent entries on top. -->

### 2026-06-18 · claude-opus-4-8 · branch `feature/feat-0018-handler-badge-message-event`

While testing on a real MR, an adjacent bug surfaced: on an element with an external label
(and message events always have one) the permanent badge was duplicated — [BUG-0016] was filed and
fixed on this same branch.

### 2026-06-18 · claude-opus-4-8 · branch `feature/feat-0018-handler-badge-message-event`

The extended scope was implemented. The handler key derivation was extracted from the private
`HandlerNavigator.#getHandlerKey` into a pure static helper
`HandlerLocator.handlerKeyFromBusinessObject(bo)` (+ a private
`#implementationHolder`, selecting the implementation holder: a nested
`bpmn:MessageEventDefinition` if it exists on the BO, otherwise the BO itself). `#getHandlerKey`
now delegates to the helper. The `</>` badge (colored for those affected in the MR, neutral
on selection, click → diff/code) started working for message **end** and message
**intermediate throw** events "for free" — `handler-locator.js` (resolution/matching by the
string key) and `handler-navigator.js` (registry traversal) were not changed in logic.
Covered by 11 unit tests in `test/differ/navigation/handler-locator.test.js`
(regression service task class/external/delegate + events: nested class/delegate/
external, selecting msgDef among several defs, null for timer/without implementation/without
def/without BO). `npm test` green (776 tests).
