---
id: UX-0009
title: Rebrand the project to "bpmn-surf" (browsing-first identity)
priority: medium
status: open
---

## Statement

Rebrand the project from "BPMN Diff" to **`bpmn-surf`**, reflecting the shift in
emphasis from "MR diff tool" to a **schema browsing/exploration tool** (analyze
schemas stored in a repo, read handler code, dive into call activities and back —
see [FEAT-0023] — navigate to called DMN — see [FEAT-0005]). MR diff stays the
primary mode, but is no longer the whole product.

Scope of the rename:

- Repository / project name and the public README (mind the planned move to a
  public GitHub repo — pick a name and identity that travel to an English /
  open-source audience).
- `manifest.json` extension `name` / `description` / store-facing copy.
- User-visible strings and the injected GitLab button label(s) where the old
  "Diff" framing no longer fits.
- Docs: `CLAUDE.md`, `docs/*.md` headers and prose that name the project.
- Internal identifiers/paths only where cheap and safe — do **not** churn code
  paths for cosmetics; behavior must not change.

Brand identity (folded in from the original UX-0009 scope):

- **Single accent = `hsl(212, 73%, 46%)`** (decision 2026-06-19) — reuse the tone
  already used by `differ-update-indicator` in `src/differ/styles.css`; do not
  introduce a second brand hue. The cyan `hsl(180, 100%, 70%)` stays strictly
  functional (canvas highlight), not brand. The "surf" feel comes from the
  wordmark/icon, not from a new color.
- Accent style for the injected GitLab button so it is distinguishable from
  native buttons, while keeping the native button shape (size, rounding,
  placement). Accent via a dedicated CSS class, no full style override
  (theme-conflict risk).
- **Extension icon** — `manifest.json` currently has neither top-level `icons`
  nor `action.default_icon`. A brand needs an icon (and the Web Store requires
  one in area B). Add icon assets as part of the rename.
- **Wordmark in the differ toolbar** (next to `differ-update-indicator`) — the
  brand's home inside the tool itself, and a natural anchor for the feedback
  link ([FEAT-0024]).
- Rename the popup (`src/popup/popup.html` / `popup.css` still say "BPMN differ").

### Decisions (2026-06-19)

- **Relaunch scope: area A first, then B.** R1 = internal `bpmn-surf` relaunch
  (rename + browsing features), shipped to the company via the chat channel. The
  public GitHub/Web Store launch (area B) is a later milestone — see [INFRA-0007].
- **The rename commit is gated** on the browsing story being true: it lands only
  after [FEAT-0023] (back navigation) and [FEAT-0005] (navigate to called DMN).
  The name promises free movement between schemas (dive in *and* out); shipping
  it before back-nav exists would make the brand a promise the product can't keep.
- **Button accent — main labels only.** Apply the accent to `Show schema diff` /
  `Show decision diff` and `Show schema` / `Show decision`; do **not** accent the
  secondary `Show diff with local`. (Resolves the first open question below.)
- **Content-script button CSS — a separate content-style file**, independent of
  the differ-page styles (the button lives in GitLab's DOM, not on the differ
  page). (Resolves the second open question below.)

## Context

- Decision (2026-06-18): the chosen name is **`bpmn-surf`**. The alternative
  "CamOD / Camunda Operator Desktop" was set aside — it overcommits to a specific
  vendor (Camunda) and to a runtime/operator role the tool does not have today.
  That direction is captured separately as a prod-operator idea — see [IDEA-0003].
- The injected button is created in `GitLabUIRepoProvider.addButton()`
  (`src/content/providers/gitlab/gitlab-ui-repo-provider.js`). Labels:
  - `'Show schema diff'` (BPMN), `'Show decision diff'` (DMN) — line ~92;
  - `'Show diff with local'` — line ~52.
- Content-script styles vs differ-page styles: the injected button lives in
  GitLab's DOM, not on the differ page — make sure the accent CSS lands in the
  correct style scope.
- This is a multi-touch change (repo, manifest, docs, store copy); the actual
  rename work may warrant splitting into an INFRA sub-task when picked up.

### Open questions

- ~~Apply the button accent to all three labels or only the main ones~~ →
  resolved: main labels only (see Decisions).
- ~~Where to keep the content-script button CSS~~ → resolved: a separate
  content-style file (see Decisions).

### Relations

- [FEAT-0023] — back navigation; [FEAT-0005] — navigate to called DMN. **Gate:**
  the rename commit lands only after both ship (see Decisions). Part of the same
  browsing-first shift this rebrand reflects.
- [FEAT-0024] — in-product feedback link; the relaunch's feedback loop, shipped
  alongside the brand work in R1.2.
- [INFRA-0007] — area B (public GitHub launch); the `bpmn-surf` name travels to
  the public repo there.
- [IDEA-0003] — the CamOD / prod-operator direction (separate product scope).
- [UX-0006] — archived; a different button (Highlight on the canvas), listed
  only to avoid confusion.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
