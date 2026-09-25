---
id: FEAT-0035
title: Configurable handler annotations, and a settings file to hand to a team
priority: medium
status: done
---

## Statement

Handler resolution recognised two annotation styles, both hardcoded:
`@ExternalTaskSubscription` (stock Camunda) and one in-house annotation of a
single company, meaningless anywhere else. Make the names
configurable, with only the stock one on by default.

On top of that, let the settings be exported to a file and imported from one, so
a team can be handed a ready configuration — their GitLab host plus their own
annotation — instead of each person retyping it.

## Context

The two styles differ in where the topic comes from, so they stay two lists
rather than one:

- **topic annotations** state it as a string argument —
  `@ExternalTaskSubscription("validateOrder")`;
- **class-name annotations** state nothing, and the framework derives the topic
  from the annotated class name with a lower-cased first letter.

Delegates (`camunda:class`, `camunda:delegateExpression`) carry no annotation and
are unaffected.

Storage: the annotations live in `chrome.storage.sync` under the existing
`settings` key. The hosts deliberately do **not** — they are the granted optional
permissions, and `docs/conventions.md` forbids a second copy. The export file
therefore *names* hosts; importing asks Chrome for them.

The differ page has no `chrome.*` (it is an `about:blank` inheriting the GitLab
origin), so the resolved annotations travel to it inside the differ params, the
way `extensionVersion` does — including into nested and edit tabs.

Related: [FEAT-0033] (the hosts this export carries), [FEAT-0015].

## Work log

### 2026-09-25 · claude-opus-5 · working tree (uncommitted)

New `src/core/handler-annotations.js`: `DEFAULT_HANDLER_ANNOTATIONS`
(`topic: ['ExternalTaskSubscription']`, `className: []`),
`normalizeHandlerAnnotations` (strips a leading `@`, keeps only identifier-shaped
names so a stored value can never widen the regex built from it, de-duplicates,
treats a non-array as "not configured" but an empty array as "switched off") and
`isDefaultHandlerAnnotations`. Loaded in all three scopes, so it holds no
`chrome.*` and no DOM.

New `src/core/settings.js`: `loadSettings` / `loadHandlerAnnotations` /
`saveHandlerAnnotations` over `chrome.storage.sync`, plus `buildSettingsExport`
and `parseSettingsExport` (format version 1; hosts written as bare hostnames so
they read back through `normalizeHostPattern`, which rejects anything with a `*`).

`HandlerLocator` builds both regexes from the configured names instead of
holding them as constants; the static extractors take an optional annotations
argument and the instance methods pass the configured one. With no class-name
annotation configured that whole search path is skipped rather than guessing at
a class whose name matches the topic.

Plumbing: `App` reads the setting, `DiffParamsBuilder` puts it in the params,
`DifferParams` normalises it and carries it into `toNestedDifferParams` /
`toEditDifferParams`, `BpmnDiffer` hands it to the locator.

Popup: two lists with add/remove (removing the last entry switches a style off),
an explanatory tooltip, and Export / Import. Import applies the annotations
immediately and then offers a separate button for the hosts, because reading the
file consumes the user gesture `chrome.permissions.request` needs.

Manifest: `storage` permission; `handler-annotations.js` + `host-patterns.js` +
`settings.js` in `content_scripts`; `handler-annotations.js` in
`web_accessible_resources` and in `utils.js#loadScripts`.

Tests: `test/core/handler-annotations.test.js`, `test/core/settings.test.js`;
the class-name-style cases in `handler-locator.test.js` now opt the style in
and assert it is off by default. `npm test` green (1256).

Not verified in a browser yet: the popup UI and the export/import round trip.
Not committed — the commit is the human's call.

### 2026-09-25 · claude-opus-5 · working tree (uncommitted), follow-up

Review pass on the same change:

- The two extractor/search methods were named after that in-house annotation;
  they are now named after the style (`extractClassNameTopics`,
  `#searchClassNameAnnotationLocation`). The
  old names carried one company's annotation although nothing in the logic is
  specific to it; every remaining mention of that annotation is gone from `src/`,
  `test/` and `docs/` (it lives only in the user's own exported settings file
  now). Same for a company constant and host name that had slipped into fixtures.
- Popup restructured into a home screen (version, feedback link, then one row per
  settings group with a live summary) plus a screen per group with a back arrow.
  The `?`-badge tooltip is gone — it was what overflowed the 340px popup; each
  screen now has room for a plain hint. The annotation lists are labelled by what
  distinguishes them, "Topic in the annotation" / "Topic from the class name",
  with a neutral `AnnotationName` placeholder.
- Rendered all four screens in Playwright with a stubbed `chrome.*`: no page
  errors, no horizontal overflow, tallest screen 549px (a Chrome popup scrolls
  past ~600px).

### 2026-09-25 · claude-opus-5 · `b3519b0` (branch `feature/handler-annotations-and-diff-button-fixes`)

Committed and opened as PR #4. All four popup screens were rendered and checked
for overflow; the export/import round trip is covered by unit tests through the
real `parseSettingsExport`.

Closed.
