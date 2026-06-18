---
id: FEAT-0003
title: Highlight elements whose delegates have changed
priority: medium
status: done
---

## Statement

Highlight Service Tasks and other elements that did not change per the schema, but whose Java/Kotlin delegate logic changed in this same MR. It should be visible even when the element's parameters also changed (currently it is already blue from a property change).

Options: a "button" to navigate to the delegate next to the element / in the Implementation panel (highlight it if the delegate was changed in this MR); a frame around the element; a separate color (color conflict).

## Context

- Related to [FEAT-0004].
- Affected files: `handler-navigator.js`, `handler-locator.js`.
- Done: external task (existed) + delegates (`camunda:class`/`delegateExpression`) and Java handlers (see the "Refinement plan" below and the Work log). Deep analysis of transitive dependencies was moved to a separate task [FEAT-0015].

## Refinement plan (FEAT-0003 highlighting + FEAT-0004 opening the code)

> Prepared 2026-06-15. Decisions agreed with the user: support **both** `camunda:class` **and** `camunda:delegateExpression`; matching — by the **simple class name** (not FQN); add the `.java` extension. Transitive analysis — in [FEAT-0015]. **Implemented 2026-06-15** (see the Work log) — the plan is kept as a record of what was done.

### Idea: a unified handler key

Currently the whole feature is tied to the topic string: `Map<topic, {filePath, diffType}>`, the BO is read as external/topic, the search is by topic. We generalize to a **namespaced key**:

- `topic:<topic>` — external task (as now);
- `class:<SimpleName>` — delegate (both `camunda:class` and `delegateExpression`).

`camunda:class="com.foo.Bar"` → `class:Bar`. `delegateExpression="${bar}"` → bean `bar` → by the Spring convention (bean name = class name lowercased) class `Bar` → `class:Bar`. A changed file `Bar.kt`/`Bar.java` declaring `class Bar` → `class:Bar`. All three converge on `class:Bar` — we reuse the existing search `class <Name>` (`#searchWrapToExternalTaskLocation`).

### Changes by file

**1. `src/differ/navigation/handler-navigator.js`** — the "demand" side (element → key):
- `#getExternalTopic(elem)` (lines 91-97) → `#getHandlerKey(elem)`, returns a namespaced key or null:
  - `bo.type === 'external' && bo.topic` → `topic:${bo.topic}`;
  - `bo.get('camunda:class')` → `class:${simpleClassName(...)}`;
  - `bo.get('camunda:delegateExpression')` → extract the bean from `${...}`, `class:${capitalizeFirstLetter(bean)}`; a complex expression (dots/calls) → null (limitation).
  - ⚠️ Read the attributes via `bo.get('camunda:class')` / `bo.get('camunda:delegateExpression')` (not `bo.class` — `class` is reserved). Verified: the attributes exist in `libs/camunda-bpmn-moddle/resources/camunda.json`.
- All references to topic in `refreshChangedBadges` (68-74), `showOverlayForSelectedElement` (79-89), `#onOpenCode`/`#resolveTargetUrl` (119-168) → work with the generalized key. Delegate tasks now also get an on-demand badge on selection — as expected.
- For the fallback search `blobSearchPageUrl` a "human" term is needed: for `topic:` — the topic, for `class:` — the class name. Thread the term through from the key.
- Update the header comment (lines 1-20): delegates are no longer a "future extension".

**2. `src/differ/navigation/handler-locator.js`** — the "supply" side (changed files) and resolution:
- `#HANDLER_FILE_EXTENSIONS` (line 25): `['.kt', '.java']`. The subscription regexp is already language-agnostic; `class <Name>` works in Java too.
- `findChangedHandlers` (128-150): for each changed handler file collect keys = topic keys (`extractHandlerTopics`, as now) ∪ class keys. Add a static `extractDeclaredClassNames(content)` (regex `\bclass\s+([A-Za-z_]\w*)`) → `class:<Name>`. Over-collecting is safe: `class:Foo` yields a badge only if there is an element on the schema with the delegate `Foo`.
- `resolveLocation(topic, ref)` (157-174) → `resolveLocation(key, ref)`, a dispatcher by prefix:
  - `topic:` → as now (`#searchSubscriptionLocation || #searchWrapToExternalTaskLocation`);
  - `class:` → the new `#searchClassDeclarationLocation(className, ref)` — this is `#searchWrapToExternalTaskLocation` (296-318) without the requirement of the `@WrapToExternalTask` annotation (we take the first hit in the handler file). Refactoring: extract a common private search by `class <Name>` with an optional preference for the annotation.
- Update the header (lines 4-22): delegates are supported; keep only the note about transitivity ([FEAT-0015]).
- (Optional, beyond the minimal scope) rename the class `ExternalTaskHandlerLocator` → `HandlerLocator` (affects `test/support/scope.js`, `bpmn-differ.js`, the tests). Can be deferred, updating only the doc comment.

**3. `src/differ/bpmn/bpmn-differ.js`** — no changes required: the map is opaque to it; `#loadChangedHandlers` (331-345) and the pass-through into the navigator remain.

### Note on FQN and collisions (on request)

Matching by the simple class name (`Bar`) allows a theoretical **collision**: two classes `Bar` in different packages would yield the same key `class:Bar` — the badge/resolution may point to the wrong file. In practice this is rare. If it becomes a problem — switch to FQN: the key `class:com.foo.Bar`, take the package from the path of the changed file + the declaration, and on the BO side — directly from `camunda:class`. Record this trade-off with a comment near `#getHandlerKey` and `extractDeclaredClassNames`.

### Known limitations (to be documented in the code and in the Work log upon completion)
- A `delegateExpression` with a non-standard bean (`@Component("custom")`, bean ≠ the decapitalized class name) is not resolved by the convention — out of scope for this iteration.
- A `delegateExpression` with a complex expression (method calls, dot navigation) → no key is built.
- Matching by the simple name → possible package collisions (see above).

### Tests (`test/handler-locator.test.js`; style — many small tests, public API only)
- `isHandlerFile` accepts `.java`.
- `extractDeclaredClassNames`: one/several classes, with modifiers/annotations, Kotlin and Java, empty/null.
- Make the pure key helpers static and cover them: `simpleClassName('com.foo.Bar') === 'Bar'`, extracting the bean from `${bar}`, `capitalizeFirstLetter`. Place them in the locator so they can be tested without bpmn-js.
- The navigator side (`#getHandlerKey`) is tied to the bpmn-js BO → we do not cover it with unit tests (as is currently the case for `HandlerNavigator`); the check is manual.

### Manual check
An MR with a change to: (a) an external task `.kt` — regression; (b) a `camunda:class` delegate on `.kt` and `.java`; (c) a `delegateExpression="${bean}"` delegate. Check the badge of the right color (added/changed/removed) and the opening of the code / MR-diff. See `docs/testing.md`.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-06-15 · claude-opus-4-8 · (branch `feature/delegate-change-highlight`)

The generalized handler path was implemented — the task is closed. A namespaced key `topic:<topic>` | `class:<SimpleName>` was introduced, on which both the highlighting and the opening of the code (FEAT-0004) are based:

- `handler-navigator.js`: `#getExternalTopic` → `#getHandlerKey(elem)` — builds the key from the BO: external task → `topic:`; `camunda:delegateExpression="${bean}"` → `class:<Bean capitalized>`; `camunda:class` → `class:<SimpleName>` (delegateExpression is checked before class; via the locator's static helpers). The attributes are read with `bo.get('camunda:class')` / `bo.get('camunda:delegateExpression')` (`class` is reserved). Delegate tasks now also get an on-demand badge on selection.
- `handler-locator.js`: `#HANDLER_FILE_EXTENSIONS` += `.java`; `extractDeclaredClassNames` (regex `\bclass\s+<Name>`) + `extractHandlerKeys` (topic keys ∪ class keys); the static key helpers `simpleClassName` / `classKeyFromClassName` / `classKeyFromDelegateExpression` / `termFromKey`; `findChangedHandlers` collects namespaced keys; `resolveLocation(key, ref)` — a dispatcher by prefix; `#searchWrapToExternalTaskLocation` and the new `#searchClassDeclarationLocation` were reduced to a common `#searchClassLocation(className, ref, preferAnnotation)`.
- Tests: `isHandlerFile` for `.java`; covered `extractDeclaredClassNames`, `extractHandlerKeys`, `simpleClassName`, `classKeyFromClassName`, `classKeyFromDelegateExpression` (incl. `${...}`/`#{...}`, complex expressions → null), `termFromKey`. The navigator side (`#getHandlerKey`) on the bpmn-js BO — a manual check. All 278 tests green.

Limitations (documented in the `handler-locator.js` header): a non-standard delegate bean, a complex `delegateExpression` expression, collisions of simple class names between packages; transitive analysis — [FEAT-0015]. The class `ExternalTaskHandlerLocator` was renamed to `HandlerLocator` — the name reflects support for both external tasks and delegates (affected `handler-navigator.js`, `bpmn-differ.js`, `test/support/scope.js`, the tests, `docs/architecture.md`).

### 2026-06-14 · — · (branch `feature/delegate-change-highlight`)

Done for an external task in Kotlin: on a task whose handler was affected in the MR, an overlay badge "‹/›" (`handler-navigator.js`) is shown permanently, the color — by the change type of the handler file (green=added, blue=changed, red=removed, like the diff colors); the type is determined by the flags of the MR changes API, by a reverse scan of `.kt` files by topic (`handler-locator.js#findChangedHandlers` → `Map<topic, {filePath, diffType}>`). A removed handler is scanned on the target ref and is visible on the target version of the schema (where the step still exists); an added one — on the mr version. The signal is decoupled from the blue highlighting (a change of the topic name in the schema).
