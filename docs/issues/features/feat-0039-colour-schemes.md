---
id: FEAT-0039
title: Colour schemes for the diff
priority: medium
status: open
---

## Statement

The diff colours are fixed, and added vs removed is told apart by green vs red only. Some
reviewers cannot rely on that, pale fills wash out on some screens and projectors, and the
new finding levels of [FEAT-0040] and the layout category of [FEAT-0041] need colours of
their own. The user picks a colour scheme in the extension settings; every place that shows
diff colours follows it.

Requirements:

1. **Built-in schemes**:
   - **Default** — today's colours, unchanged for anyone who never touches the setting;
   - **Blue / Orange** — every category stays distinguishable without relying on telling
     red from green;
   - **High contrast** — stronger fills and borders.
2. **A scheme covers every category**: added, removed, changed, and the categories other
   tasks add (finding levels — [FEAT-0040]; layout — [FEAT-0041]). A task that adds a
   category adds its colours to every built-in scheme. Where a category is drawn both as a
   fill and as a stroke (shapes vs connections, pools and lanes), the scheme defines both,
   and the text colour where text sits on a fill.
3. **Everywhere diff colours appear**:
   - BPMN: shape fills, connection strokes, pool/lane borders, the ☼ outline, the
     properties-panel group and list-entry highlights, the condition before/after tokens,
     the changes-table badges and counters, the changed-handler badge;
   - DMN: added/removed/changed rules, cells and headers;
   - BPMN edit mode: the colouring of the merge request's changes.
4. **Readable**: in the alternative schemes, label text on a filled shape meets a contrast
   of at least 4.5:1, and essential boundaries (strokes, outlines) at least 3:1 against the
   adjacent background. The categories are distinguishable from each other and from an
   unchanged element. The existing non-colour cues (the `+` / `~` / `−` glyphs of the
   changes table) stay.
5. **When it applies**: a diff opened after the change uses the new scheme; tabs already
   open may keep the old one. Nested tabs (dive-in, edit) use the scheme of the review they
   were opened from.
6. **Portable**: the scheme is part of the settings export/import; an older export without
   the field opens with Default.
7. **Not affected**: the colours a user paints onto elements in edit mode (the swatches) are
   part of the diagram, not of the diff, and never change with the scheme.

Out of scope: picking arbitrary colours per category (a separate task if users ask); a dark
theme for the differ page; GitLab/GitHub's own page colours.

## Context

Came from the same user feedback and design discussion as [FEAT-0040].

Where the colours live today (to be collected into one source first — a refactor with no
visible change, then the schemes on top):

- `src/differ/shared/diff-type.js` — `shapeColor` / `rowColor` per category (BPMN and DMN
  painters read these);
- `src/differ/styles.css` — markers, the ☼ highlight, table badges, condition tokens,
  edit-mode styles;
- `src/differ/bpmn/properties-panel-highlighter.js` — its own `CHANGE_COLOR` / `ADD_COLOR` /
  `REMOVE_COLOR`;
- `src/differ/dmn/dmn-diff-painter.js`;
- edit mode: `src/differ/bpmn/edit/edit-diff-painter.js`, `edit-xml-colorizer.js` (writes the
  diff colours into a downloaded file);
- `src/differ/shared/branch-indicator.js` — the branch-name colours.

Settings: `src/core/settings.js` (`chrome.storage.sync`, export format versioned). The differ
page has no `chrome.*`; values reach it inside the differ params
(`src/content/diff-params-builder.js`, `src/differ/shared/differ-params.js`), and nested tabs
copy them from the opener.

`src/differ/bpmn/edit/edit-color-control.js` holds the user's element colours (requirement 7)
— leave it alone.

Open questions:

- Does the branch-name colour (dark red target / dark blue merge request) follow the scheme?
- Edit mode can download the edited file with the diff colours written into it. Should that
  file use the chosen scheme or always Default (it may be opened by someone else)?
- The exact colour values of the two new schemes — propose them with screenshots in the PR.

Acceptance:

- No setting saved → every diff renders with today's computed colours (pin them in a test).
- Each scheme on a BPMN diff (view and edit mode) and a DMN diff: assert the computed colours
  of a shape, a flow, a pool, a panel group, a condition token, a table badge and a DMN cell,
  on both sides of Switch branch; no red/green pair is the only distinction in Blue / Orange.
- Settings export → import into a fresh profile → same scheme; an old export → Default.

## Work log

<!-- Each AI session on the task — a separate entry by the template below.
     Add new entries on top (freshest first). -->
