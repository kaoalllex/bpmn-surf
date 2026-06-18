---
id: FEAT-0021
title: Clickable hyperlinks in an element's documentation and annotations
priority: low
status: open
---

## Statement

If an element has a "comment" with a hyperlink — make the link **clickable**
and open it in an **adjacent tab**. By "comment" we mean:

- the element's `bpmn:documentation` (what is shown in the properties panel);
- `bpmn:TextAnnotation` text annotations (stickers on the canvas, text in `bo.text`).

A URL in the text turns into an `<a>`, a click opens the link via
`window.open(url, '_blank')` (the approach already used in the project).

## Context

### Where to get the text

- **documentation**: `element.businessObject.documentation` — an array of objects with
  `.text`. The documentation is already accounted for in `bpmn-xml-comparator.js` (the
  `Documentation` property group) and in the full-text index `element-searcher.js`.
- **TextAnnotation**: `bo.text`. Currently annotations are only **tinted** on a
  diff (`src/differ/bpmn/diff-highlighter.js:42`); their text is not parsed anywhere.

### Where to embed the links (the key difficulty)

- The properties panel is the **built-in bpmn-js properties-panel** (Preact, minified).
  Its re-render will **wipe** any of our insertions into its DOM. We cannot simply rewrite
  its nodes.
- **A ready-made workaround pattern** already exists: `PropertiesPanelHighlighter`
  (`src/differ/bpmn/properties-panel-highlighter.js`) injects **its own
  `<div>`** under a group (see condition expression, `#CONDITION_DIV_ID`).
  The same technique → a separate "Documentation" block of ours with clickable links.
- For `TextAnnotation` the shape on the canvas is SVG text; clickable `<a>` inside
  SVG are inconvenient. Option: show the annotation's links in our panel block on
  selecting the annotation / or an overlay badge. **To resolve during the work.**

### Linkify and security

- There is no ready-made linkify function in the project — **write** a pure function
  "text → segments (plain / link)".
- There is no explicit sanitization (DOMPurify and the like) in the project; property output goes through
  `textContent`. Therefore: put non-empty segments through `textContent`, and for links
  create an `<a>` with `rel="noopener noreferrer"`, **validating the URL scheme** — only
  `http`/`https` (cut off `javascript:` and the like).

### Open questions

- Link detection: only explicit `http(s)://…`, or also "bare" domains / relative
  GitLab links. Baseline — explicit `http(s)`.
- UI for links from `TextAnnotation` (own panel block vs overlay).
- DMN: there is **no** properties panel (`dmn-js`) → the documentation case is not applicable for DMN;
  annotations — separately, if relevant at all. Baseline — BPMN only.

### Tests

- Pure linkify: text without a URL; one URL; several; a URL with trailing punctuation
  (`...(see http://x).`); a `javascript:` scheme → not a link; empty/undefined text.

### Links

- [IDEA-0002] — **different**: authoring comments via the GitLab comments mechanism;
  here — making links clickable in already existing documentation/annotation.
- [FEAT-0020] — context menu / actions on an element (an adjacent integration point).

### Affected files (expected)

- a new pure linkify function + tests in `test/differ/`.
- `src/differ/bpmn/properties-panel-highlighter.js` or a new class — injecting a documentation
  block with links (the `#CONDITION_DIV_ID` pattern).
- the call site — `src/differ/bpmn/bpmn-differ.js`, `#onSelectedElementChanged`.

## Work log

<!-- Each AI session on the task is a separate entry per the template below.
     Add new entries at the top (freshest first). -->
