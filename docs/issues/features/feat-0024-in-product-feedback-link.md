---
id: FEAT-0024
title: In-product feedback link (explicit, context-prefilled)
priority: medium
status: open
---

## Statement

Give users an explicit, one-click way to send feedback / report a bug from
inside the product. Part of the `bpmn-surf` relaunch ([UX-0009]): a relaunch
needs a feedback loop, but the tool's privacy posture ("no data is sent" — see
README and the update-checker) means feedback must be **user-initiated only** —
never silent telemetry.

Surfaces to add the link to (by ROI):

1. **Popup footer** — the persistent home. The popup is already the "meta"
   surface (updates, transparency); add a "Feedback / report a bug" link next to
   the version.
2. **Differ toolbar** — a small "💬 Feedback" affordance near the
   `differ-update-indicator`. Contextual: the user is looking at a diagram, hits
   a wrong diff → one click. Captures feedback at the moment of friction.
3. **Empty / error state** — when a diff fails to build or the entry button
   cannot find its container ([BUG-0003]): "something off? tell us". Turns
   failures into signal.
4. **README + the "what's new" block** of the update popup — a one-line pointer.

**Prefill context** into the link: extension version, GitLab version, file type,
URL pattern — but **never** schema content. Makes reports actionable and designs
the same fields telemetry would eventually collect.

## Context

- The channel is **GitHub Issues**: `FEEDBACK_URL` in `src/core/config.js` already
  points at the repository's issue tracker. Still to do — an issue template, and a
  `mailto:` as the low-friction path for private bug reports.
- The feedback URL/email stays **configurable** (`src/core/config.js`, alongside the
  `UPDATE_*` URLs) so the channel can move without code churn.

### Relations

- [FEAT-0013] — usage telemetry. This is its lightweight, privacy-safe
  predecessor: explicit, click-driven, same context fields. Telemetry stays
  deferred.
- [UX-0009] — the relaunch this feedback loop serves.
- [BUG-0003] — error-state surface ties into the "button missing" failure.

### Approach B — auto-publish a chat post via the v4 API (2026-06-22)

A richer alternative (or second iteration) of the plain link/`mailto` above:
instead of just *opening* the channel, the user writes a short description in an
in-product composer and we **POST a real post into the chat channel** through the
`create-post` API
(`https://messenger.example.com/time-server/docs/v4/create-post`),
attaching the context automatically (logs, link to the schema/MR, env fields).

The post is published **only on an explicit user keystroke** (Enter / Cmd+Enter
in the composer) — never auto-sent. That keystroke is the consent gate and fixes
**authorship to the user** (the post is created under the user's own chat
identity, not a bot/service account). This keeps the privacy invariant of the
tool ("nothing is sent silently / user-initiated only") while still landing
feedback directly in the channel.

**Why this is a meaningful step up from area A's plain link:** it moves us from
"sending data is never automated" to "data *is* sent over the network on submit".
That is acceptable only with (a) a visible preview of exactly what will be sent,
(b) an explicit submit action, and (c) no schema content ever included. Document
this posture change in the README alongside the update-checker note.

#### Implementation sketch

1. **Composer UI** (reuse FEAT-0024 surfaces — popup footer + differ toolbar 💬):
   a small modal/panel with a `<textarea>` for the user's text, a *collapsible
   preview* of the attached context, and submit-on-Enter (see open question on
   Enter vs Cmd/Ctrl+Enter — plain Enter collides with newlines in a textarea).
   The differ page is a plain `about:blank` web context with no `chrome.*`, so its
   composer must hand the payload back to the content script (same pattern as the
   `UpdateIndicator` → `update:openUrl` round-trip).
2. **Context collection** (the FEAT-0024 prefill fields, made concrete):
   - *user text* — from the textarea.
   - *schema / MR link* — the GitLab page URL (MR/blob) from the content script;
     on the differ page, rebuild it from `DifferParams` (file name + versions).
   - *logs* — **new infra**: add a small in-memory ring buffer fed from the
     existing `appendTimeToConsoleLogs()` proxy in `src/core/utils.js` (it already
     wraps `console.debug/info/warn/error`). The differ page keeps its own buffer
     and ships the tail back with the payload. Attach only the last N lines.
   - *env* — extension version (`manifest`), GitLab version (DOM scraper),
     file type, URL pattern. **Never** schema/XML content.
3. **Network call** — route through the background service worker via
   `chrome.runtime` messaging (mirrors `update:openUrl`); the SW does the `fetch`.
   Requires adding the chat/messenger API origin to `manifest#host_permissions`
   (today only `raw.githubusercontent.com` is listed). Confirm the API host — the
   `create-post` gateway host may differ from the channel host. Note this approach
   predates the move to GitHub Issues as the feedback channel.
4. **Auth & authorship** — the crux. The chat is Mattermost-based (the channel URL is
   MM-shaped), so `create-post` likely mirrors MM `POST /api/v4/posts`
   `{ channel_id, message, props }`. Two ways to author as the user:
   - **(B1) reuse the user's existing chat session** — `fetch(..., {credentials:
     'include'})` with `host_permissions` for the chat origin. MM cookie auth also
     needs the CSRF token (`MMCSRF` cookie → `X-CSRF-Token`/`X-Requested-With`
     header). No stored secret; requires the user to be logged into the chat in the
     same browser. *Recommended if it works — authorship is intrinsically the
     logged-in user.*
   - **(B2) Personal Access Token** entered in settings, stored in
     `chrome.storage`. Robust, explicit, authorship = token owner — but stores a
     credential.
   - `channel_id` of the `bpmn-surf` channel: resolve by name via the API, or pin
     it in `config.js` next to `FEEDBACK_URL`.
5. **Config** — add the API base URL + `channel_id` (and any token) to
   `src/core/config.js` alongside `FEEDBACK_URL`, so the channel/host can change
   without code churn.

#### Open questions (decide before building B)

- **Auth model:** B1 (session cookie + CSRF) vs B2 (Personal Access Token)?
- **Exact API contract** — the docs are behind corporate SSO (302 → devplatform
  login); read the authed page for method/endpoint/headers/body before coding.
- **Submit key** — plain Enter vs Cmd/Ctrl+Enter (textarea newline conflict).
- **Logs** — attached by default, or opt-in per submission? Scrub repo
  paths/names, or show them in the preview and let the user delete?
- **Destination** — public `bpmn-surf` channel post vs a thread/DM.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
