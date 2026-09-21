---
id: FEAT-0024
title: In-product feedback link (explicit, context-prefilled)
priority: medium
status: done
---

## Statement

Give users an explicit, one-click way to send feedback / report a bug from
inside the product. Part of the `bpmn-surf` relaunch ([UX-0009]): a relaunch
needs a feedback loop, but the tool's privacy posture ("no data is sent" — see
README and the update-checker) means feedback must be **user-initiated only** —
never silent telemetry.

Surfaces to add the link to (by ROI):

1. ✅ **Popup footer** — the persistent home: the "Leave feedback" link next to the
   version (shipped 2026-09-12).
2. ✅ **Differ toolbar** — the "💬" button in the toolbar's right block, on both the
   BPMN and the DMN differ (shipped 2026-09-21). Contextual: the user is looking at a
   diagram, hits a wrong diff → one click. Captures feedback at the moment of friction.
3. ❌ **Empty / error state** — when a diff fails to build or the entry button cannot
   find its container ([BUG-0031]): "something off? tell us". **Dropped**, not deferred:
   the 💬 button is present in every differ state (including the empty ones) and badges
   itself on an uncaught failure, which covers the same moment without a second surface.
4. ✅ **README** — a one-line pointer (the Issues link in the README's links list).

**Prefill context** into the link: extension version, platform + host, file name and
type, the compared refs, URL pattern, and a tail of the console log — but **never**
schema content. Makes reports actionable and designs the same fields telemetry would
eventually collect.

## Context

- The channel is **GitHub Issues**: `FEEDBACK_URL` in `src/core/config.js` already
  points at the repository's issue tracker. Still to do — an issue template (part of
  v1); a `mailto:` for private reports is dropped (see the decisions below).
- The feedback URL/email stays **configurable** (`src/core/config.js`) so the channel
  can move without code churn.

### Decisions (agreed 2026-09-21) — v1 scope

v1 is "the report at the moment of friction": one 💬 button in the differ toolbar that
opens a **prefilled GitHub issue**, including the console log the session produced. No
composer, no network call from the extension — `window.open` and nothing else.

- **Surface**: the 💬 button lives in the differ toolbar's right block (before Close),
  on **both** the BPMN and the DMN differ — the toolbar code is per-view, so both
  `bpmn-differ-view.js` and `dmn-differ-view.js` get it (the shared-class rule).
  The popup keeps its plain link; surfaces 3 (empty/error state) and `mailto:` are
  deliberately out of v1.
- **Prefill** via `…/issues/new?title=…&body=…`, with `template=` once the issue
  template exists. Fields: extension version, platform kind + host, file name + type,
  both compared refs/labels, the page URL pattern, and the console log tail. **Never**
  schema or XML content.
- **Console log — capture**: a bounded ring buffer fed from
  `utils.js#appendTimeToConsoleLogs()`, which already proxies
  `console.debug/info/warn/error` and is installed in all three scopes (`app.js`,
  `bpmn-differ.js`, `dmn-differ.js`). `console.log` is not used anywhere in `src/`, and
  because the proxy replaces the global methods, errors logged by bpmn-js/dmn-js land in
  the buffer too. Add `window.onerror` and `unhandledrejection` into the same buffer —
  the failures that matter most never go through `console.*`.
- **Console log — scope**: only the buffer of the page the button was pressed on (the
  differ's own). Pulling the content-script tail across `window.opener` is **deferred**
  until a real report shows it is missing — it needs its own message round-trip.
- **Budget**: the browser tolerates long URLs, GitHub does not — a prefilled issue URL
  is rejected around 8 KB (414). So the *whole URL* is budgeted: the log goes last,
  inside a `<details>` block, trimmed to roughly the last 50 lines / 4 KB with an
  explicit `… N earlier lines omitted` marker. The buffer itself keeps more (~200 lines)
  so the marker is honest.
- **Privacy**: the GitHub issue form *is* the preview — the user sees the whole body and
  edits or deletes anything before submitting, which satisfies the "visible preview of
  exactly what will be sent" rule. The extension itself sends nothing. Logs may still
  carry file paths, branch names and an internal host, so the body must make that
  visible rather than bury it.
- **Extension version on the differ page**: there is no `chrome.*` there, so the version
  must travel in the differ params (`extensionVersion` on `DifferParams`, filled by the
  content script from `chrome.runtime.getManifest().version`). The param channel that
  used to carry `updateInfo` was removed with [FEAT-0012].
- **Global state carve-out**: the differ page bans global mutable state. The ring buffer
  is an accepted exception — write-only diagnostics with no effect on rendering, reachable
  only through `getConsoleLogTail()`. Record the carve-out in `docs/conventions.md` when
  implementing, so the next reader does not treat it as a violation.
- **Closing**: when v1 ships the task goes to `done`, with surface 3, `mailto:` and the
  cross-scope log tail recorded as dropped rather than pending.

#### Affected files (expected)

`src/core/utils.js` (ring buffer, error hooks, `getConsoleLogTail`), a new pure
`src/differ/shared/feedback-report.js` (title/body/URL assembly + budgeting) with its
registrations in `utils.js#loadScripts`, `manifest#web_accessible_resources` and
`test/support/scope.js`; `src/differ/bpmn/bpmn-differ-view.js` and
`src/differ/dmn/dmn-differ-view.js` (the button); `src/differ/shared/differ-params.js`
plus `src/content/diff-params-builder.js` (the `extensionVersion` field);
`.github/ISSUE_TEMPLATE/`; `docs/conventions.md` and `docs/architecture.md`.

### Relations

- [FEAT-0013] — usage telemetry. This is its lightweight, privacy-safe
  predecessor: explicit, click-driven, same context fields. Telemetry stays
  deferred.
- [UX-0009] — the relaunch this feedback loop serves.
- [BUG-0031] — the live "no button" failure the error-state surface would turn into
  signal ([BUG-0003], named here before, is closed).

### Superseded: Approach B — auto-publish a chat post (2026-06-22)

Dropped on 2026-09-21. It proposed an in-product composer that POSTed the report into a
corporate Mattermost channel through a `create-post` API, authored as the user via their
chat session or a stored Personal Access Token. Every premise is gone: the feedback
channel is GitHub Issues, the extension ships from the Chrome Web Store with a minimal
permission list (`scripting` only — a corporate API origin in `host_permissions` would
have to be justified at review), storing a credential contradicts the privacy posture,
and its plumbing (a service-worker `fetch` mirroring `update:openUrl`) no longer exists.
Git history keeps the full sketch if the idea ever returns.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-09-21 · claude-opus-5 · branch `feature/feat-0024-differ-feedback`

v1 shipped — surface 2 done, the task closes.

`FeedbackReport` (`src/differ/shared/feedback-report.js`, pure) builds the prefilled
issue: title, a Context table (extension version, platform kind + host, page, file +
type, both compared labels and blob links) and the console tail in a `<details>` block.
The budget is on the **whole URL** (7000 chars, GitHub 414s around 8 KB), so the log
sheds lines until it fits — debug chatter first, wherever it sits, because a warning or
a stack trace is worth more to a reader than the debug line before it. Both markers are
explicit: `… N earlier lines omitted` / `… N debug lines dropped to fit the URL`.
Schema/XML content is never in the body — pinned by a test that pollutes the context
object with XML and asserts it does not surface.

The log comes from a 200-line ring in `utils.js`, filled by the existing
`appendTimeToConsoleLogs()` proxy plus `error`/`unhandledrejection` listeners. The tail
is two-tier: the last N lines of any level (the narrative around the button press) plus
every buffered `warn`/`error`/`uncaught`/`unhandled-rejection`, wherever it sits, with
`… N lines skipped` on the joins. A plain tail was the wrong shape — live `console.debug`
calls outnumber `warn`+`error` 99 to 65, so a quiet ending regularly pushed the single
warning that explains the report out of the window before the URL budget ever saw it. Two
additions beyond the agreed plan, both because the first readers of these logs will be
AI agents triaging a report:

- **Call site per line** (`12:00:00.000 warn [handler-navigator.js:125]: …`), derived
  from the proxy's own stack. Without it a reader cannot locate the code: e.g.
  `'cannot find overlay element by id: '` is logged verbatim from three navigators.
- **`describeDifferParams()`**, because `console.debug('diff params: ', rawParams)` in
  both orchestrators dumped the whole camunda moddle (~100 KB) and, in local-file mode,
  the user's own diagram XML. That was a live privacy leak into any report, and it also
  ate the entire log budget. Arguments are additionally capped at 300 chars.

`extensionVersion` travels on `DifferParams` (and through nested/edit params), filled by
`DiffParamsBuilder`, which now takes it via the constructor rather than reading `chrome.*`
itself — the differ page has no `chrome.*`. `config.js` joined the differ-page registries,
since `FEEDBACK_URL` is read there.

The button badges itself (one pulse, then a static red dot) on an uncaught error or a
rejected promise — **not** on `console.error`, which dmn-js emits on every single load
([INFRA-0001]); that trigger would cry wolf on every DMN diff. Pinned by a test that
fires `console.error` and asserts the button stays clean.

Alongside, a UX change the toolbar asked for: `Hide properties` was the only text button
in the right half and its width changed as the label flipped. It is now a `◨`/`◻` icon
carrying the action as its `aria-label`, moved next to 💬, so view and edit mode end the
same way — panel toggle · feedback · close. Two e2e specs updated to locate it by name.

`registries.test.js` gained a duplicate-path guard after this work introduced one that
every existing check happily ignored.

**Dropped, not deferred:** surface 3 (empty/error state — see above), `mailto:` (the
GitHub issue form is the preview and the private-report argument died with the move to a
public tracker), and the cross-scope console tail via `window.opener` (needs its own
message round-trip; nothing so far shows the differ's own buffer is insufficient).

Tests: `npm test` 1180 green, `npm run test:e2e` 146 green. Every new test was observed
failing under a targeted mutation, including one guard that could not fail
(`Set.add` returns the Set, so a duplicate filter was always empty) — caught by that pass.

### 2026-09-21 · claude-opus-5 · branch `docs/feat-0024-refresh`

No code — brought the task in line with reality and pinned down v1. Surfaces 1 and 4 are
in fact shipped (the popup link and the README Issues pointer); the file still listed
surface 4 as pending. Approach B cut down to a superseded note (its premises died with
the move to GitHub Issues and the Chrome Web Store permission diet). Added the v1
decisions: a 💬 button in both differ toolbars opening a prefilled GitHub issue that
carries the context fields plus a console-log tail, captured by a ring buffer hooked into
the existing `appendTimeToConsoleLogs()` proxy and `window.onerror`/`unhandledrejection`.
Deferred by decision: the content-script log tail via `window.opener`, the empty/error
state surface, and `mailto:`.

### 2026-09-12 · claude-opus-5 · `5f9a94b`

Surface 1 (popup footer) shipped as part of the move to public GitHub: the
"Leave feedback" link in `src/popup/popup.html` opens `FEEDBACK_URL`
(`src/core/config.js`), now `https://github.com/kaoalllex/bpmn-surf/issues`.
Surfaces 2-4 (differ toolbar, empty/error state, README pointer)
and the prefilled context are not done.
