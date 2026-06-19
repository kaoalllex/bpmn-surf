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

- Channel depends on the relaunch scope (see [UX-0009]):
  - Area A (internal): the existing chat channel
    (`chat.example.com/.../bpmn-diff`) + a `mailto:` for private bug reports.
  - Area B (public): **GitHub Issues** (with an issue template) becomes the home
    after the migration ([INFRA-0007]); keep `mailto:` as the low-friction path.
- The feedback URL/email should be **configurable** (`src/core/config.js`,
  alongside the `UPDATE_*` URLs) so the channel can switch A → B without code
  churn.

### Relations

- [FEAT-0013] — usage telemetry. This is its lightweight, privacy-safe
  predecessor: explicit, click-driven, same context fields. Telemetry stays
  deferred.
- [UX-0009] — the relaunch this feedback loop serves.
- [BUG-0003] — error-state surface ties into the "button missing" failure.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
