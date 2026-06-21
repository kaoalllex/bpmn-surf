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

### Decisions (2026-06-20) — R1 (area A) scope boundaries

- **Extension icon = placeholder for R1.** No designer / no build step (vanilla
  project), so R1 ships a simple placeholder icon set (16/32/48/128) in the
  brand tone; the final icon is a later task / part of area B.
- **Git repo + local folder rename are deferred to area B** ([INFRA-0007]).
  Part 1 renames only in-product strings, `manifest.json`, README and docs.
  `config.js` example URLs and `host_permissions` (tied to the actual repo move)
  stay untouched in R1.
- **`Show diff with local` dropdown is split out** into [UX-0010] (a behavioral
  change outside the rebrand scope). May ship in the same MR as its own commit.
- **Update-toast / `title` wording** (in `src/differ/shared/update-indicator.js`
  and the popup): `Update available for bpmn-surf — open the update window`
  (keeps the brand lowercase; avoids a sentence starting with a lowercased name).
- **[FEAT-0024] stays a separate task** (R1.2) — the toolbar wordmark is built as
  a convenient anchor for the future feedback link, but the link is not in R1.
- **One file, no epic split.** The meaningful split is area A (this task) vs
  area B ([INFRA-0007]); within area A the work is one coherent MR, so progress
  is tracked here in the Work log rather than in micro-subtasks.

### Decisions (2026-06-21) — button labels reworded (supersedes "labels stay")

- **Injected button labels are reworded** (was: "labels stay, only the accent
  changes" in the 2026-06-20 decision). Dropped the low-information verb "Show";
  kept the domain-neutral `schema`/`decision` vocabulary (not the `BPMN`/`DMN`
  acronyms — correct casing would be two shouty all-caps tokens, and `decision`
  reads more clearly than `DMN`). The browse entry points get the browsing-first
  verb `View`. Final set:
  - MR (diff): `Schema diff` / `Decision diff`
  - Repo/branch (browse): `View schema` / `View decision`
  - Secondary: `Diff with local`
- The accent (`.bpmn-surf-btn-accent`) is applied to the **main** button only
  (DIFF + BRANCH), not the secondary local-file button — unchanged from the
  2026-06-19 decision.
- **Toolbar wordmark dropped.** The `bpmn-surf` wordmark next to the update
  indicator (plan step 3) was built and then removed — not wanted in the
  toolbar. The brand stays in the popup, `manifest`, and (later) the icon;
  FEAT-0024 will add its own toolbar anchor for the feedback link rather than
  relying on a standing wordmark.

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
  the public repo there. Git repo / folder rename happens here, not in R1.
- [UX-0010] — `Show diff with local` dropdown; split out of this task, may share
  the R1 MR.
- [IDEA-0003] — the CamOD / prod-operator direction (separate product scope).
- [UX-0006] — archived; a different button (Highlight on the canvas), listed
  only to avoid confusion.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->

### 2026-06-21 · claude-opus-4-8 · R1 (area A) implemented

Branch `feature/ux-0009-rebrand-bpmn-surf-r1` off `origin/master`. Implemented
the full R1 plan (steps 1–6); steps 0 (copy confirmation) and 7 (verify & ship)
done in-session.

Done:
- **manifest.json** — `name` = `bpmn-surf`, `description` = `Explore and diff
  BPMN & DMN diagrams` (dropped the GitLab lock-in and the `2.0`/`schemas`
  wording on 2026-06-21 review), `default_title` = `bpmn-surf — update`;
  added `icons` + `action.default_icon` (placeholder set), added
  `content_scripts[0].css = ["src/content/content-styles.css"]`, registered
  `brand-wordmark.js` in `web_accessible_resources`.
- **Button accent** — new `src/content/content-styles.css` with
  `.bpmn-surf-btn-accent` (brand tone, border/text/hover only); applied to the
  main DIFF/BRANCH button in `gitlab-ui-repo-provider.js`, not the secondary.
- **Button labels reworded** — see the 2026-06-21 decision above (Set 1). Updated
  `#getButtonText` + the secondary label + the provider unit test + README.
- **Toolbar wordmark** — built (`brand-wordmark.js` + `.differ-wordmark`, mounted
  next to the update indicator in both views) then **removed on 2026-06-21
  review**: the blue `bpmn-surf` label in the toolbar was not wanted. Fully
  reverted — module, mirror test, CSS, and the four-registry wiring all dropped.
  The FEAT-0024 feedback link will introduce its own toolbar anchor when built.
- **Popup** — `popup.html` `<title>` + `.pu-title` → `bpmn-surf`; toast `title`
  in `update-indicator.js` → `Update available for bpmn-surf …`; the
  context-invalidated alert in `app.js` → `bpmn-surf …`.
- **Placeholder icons** — `icons/icon-{16,32,48,128}.png` in the brand tone with
  a white "surf" wave, generated by a one-off dev script (not committed). Real
  icon = later task / area B.
- **Docs** — README (title, tagline, labels), CLAUDE.md, docs/architecture.md
  (tree + flow + key-files rows for the new files), docs/issues/README.md title,
  `.claude/` agents+skills and `.agent/` identity strings.

`npm test`: 896 pass (added `brand-wordmark.test.js`; updated the provider test
labels). Untouched per scope: git repo/folder name, `config.js` URLs,
host-permissions, internal identifiers/code paths, archived `docs/issues/**`
prose, the chat channel slug.

### 2026-06-20 · claude-opus-4-8 · planning only (no branch yet)

Gate confirmed open: [FEAT-0023] and [FEAT-0005] are both `done`, so the rename
may land. Scoped and agreed the **R1 (area A)** implementation plan; nothing
implemented yet. See the 2026-06-20 Decisions above for the scope boundaries.

**Agreed R1 plan (in order):**

0. **Prep.** Branch off `master` (e.g. `ux-0009-rebrand-bpmn-surf-r1`). Before
   editing, propose the final copy and wait for confirmation: `manifest.name` =
   `bpmn-surf`; `manifest.description` ≈ `Browse and diff BPMN 2.0 & DMN schemas
   in GitLab`; `action.default_title`, popup title/header, toolbar wordmark =
   `bpmn-surf`. Injected button **labels stay** (`Show schema diff` etc.) — only
   the accent changes.
1. **manifest.json.** New `name` / `description` / `default_title`. Add `icons`
   (16/32/48/128) + `action.default_icon` (placeholder). Add
   `content_scripts[0].css: ["src/content/content-styles.css"]` (no css array
   exists today). If a new shared wordmark JS is added, register it in
   `web_accessible_resources` (do **not** reorder the JS list).
2. **Button accent.** New `src/content/content-styles.css` with a class (e.g.
   `.bpmn-surf-btn-accent`) using `hsl(212,73%,46%)` for border/text/hover only
   (no full native-style override), mirroring `.differ-update-indicator`. In
   `gitlab-ui-repo-provider.js#addButton` apply it to the **main** DIFF and
   BRANCH buttons only — not to the secondary local-file button.
3. **Toolbar wordmark.** New shared module (e.g.
   `src/differ/shared/brand-wordmark.js`, modeled on `branch-indicator.js`) +
   style in `src/differ/styles.css`; insert next to `differ-update-indicator` in
   both `bpmn-differ-view.js` and `dmn-differ-view.js`. Wire the new file into
   `utils.js#loadScripts`, `web_accessible_resources`, and `test/support/scope.js`
   (else structure tests fail). Acts as the anchor for [FEAT-0024] later.
4. **Popup.** `src/popup/popup.html` `<title>` and `.pu-title` → `bpmn-surf`.
   Update the toast/`title` text in `update-indicator.js` →
   `Update available for bpmn-surf — open the update window`.
5. **Placeholder icon.** `icons/` with 16/32/48/128 PNGs in the brand tone
   (generated by a one-off dev script, no runtime deps; the script is not
   committed). Real icon — separate task / area B.
6. **Docs.** Rename in living docs only: `README.md`, `CLAUDE.md`,
   `docs/architecture.md`, `docs/testing.md`, `docs/git-workflow.md`,
   `docs/issues/README.md`. Do **not** rewrite archived `docs/issues/**` prose,
   `config.js` URL examples, or internal identifiers. Update `.claude/` /
   `.agent/` only for project-identity strings.
7. **Verify & ship.** `npm test` (structure tests especially). Manual Chrome
   check: button accent in GitLab, wordmark in BPMN + DMN toolbars, popup, icon.
   Optional `/release` version bump. Push branch + MR into master with
   `--remove-source-branch`; merge stays with the human.

**Explicitly out of R1:** git repo / folder rename, `config.js` /
host-permissions changes (→ area B / [INFRA-0007]), the final icon, [FEAT-0024]
(separate). [UX-0010] (local-file dropdown) may ride along as its own commit.
