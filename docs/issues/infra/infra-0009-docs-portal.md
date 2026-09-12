---
id: INFRA-0009
title: Docs portal — publish user documentation as a site
priority: low
status: open
---

## Statement

Stand up a **published documentation portal** for the plugin: **Docusaurus built by
GitHub Actions and served from GitHub Pages**.

This task covers the **portal / delivery mechanism** (repo structure, config, CI,
publishing). The **content** of the docs (installation, capabilities, how-to) is
[INFRA-0006] — written as portable Markdown into the structure defined here.

Priority is low on purpose: `README.md` currently covers installation and the full
feature list, which is enough for the size of the project. The portal is worth
building only once the documentation outgrows a single file — guides, FAQ and
screenshots that make a README unreadable.

An earlier revision of this task planned to publish through AutoDoc (a managed
Docusaurus on the internal GitLab). That is gone with the move to public GitHub;
the engine is the same, only the publishing layer changes.

## Context

### Repo structure (variant A — chosen)

`docs/` becomes **the portal root: everything under it is published**. The
existing internal material (dev docs + task backlog) moves **out** of `docs/`
into a new top-level `dev/`, so the site build never sees it.

Why move it out rather than hide it via `sidebars.js`: the dev docs and `issues/`
files are full of relative links to each other and to code — built as pages under
`onBrokenMarkdownLinks: "throw"` they would fail the build. They must be
**physically excluded**, not just unlisted; moving them outside `docs/` is the most
robust exclusion.

Proposed layout:

```
bpmn-surf/
├── docusaurus.config.js       # NEW  portal config (title, links, theme)
├── sidebars.js                # NEW
├── .github/workflows/docs.yml # NEW  build + deploy to GitHub Pages
│
├── docs/                      # PORTAL ROOT — everything here is published
│   ├── index.md               #   landing: what bpmn-surf is, 1-screen overview
│   ├── getting-started/
│   │   ├── installation.md     #   reuse the install steps from README.md
│   │   └── quick-start.md
│   ├── features/              #   grouped from README features
│   │   ├── comparing-changes.md
│   │   ├── browsing-navigation.md
│   │   ├── reading-a-diagram.md
│   │   ├── editing-a-schema.md
│   │   └── versions-and-viewport.md
│   ├── guides/                #   task-oriented how-tos (later)
│   └── faq.md
│
└── dev/                       # OUTSIDE docs/ — not part of the site
    ├── architecture.md         #   moved from docs/
    ├── conventions.md
    ├── git-workflow.md
    ├── testing.md
    └── issues/                 #   whole task backlog, moved as-is
```

Docusaurus needs a Node toolchain of its own. Keep it out of the extension's
`package.json` (the repo deliberately has no build step) — a separate
`website/package.json`, or a workflow that installs it on the fly.

### Reference updates required by the `dev/` move (~11 files)

Moving `docs/{architecture,conventions,git-workflow,testing}.md` and
`docs/issues/` → `dev/...` breaks path references in: `CLAUDE.md`, several
`.claude/` skills/agents/commands (`fix`, `refactor`, `feature`, `analyze`,
`code-reviewer`, `code-explorer`, `release`, `pr`, `cleanup`), and
`docs/issues/README.md` (→ `dev/issues/README.md`). Inter-task links go by code
(`[BUG-0001]`), so issue cross-links survive the move. Use `git mv`.

### Relations

- [INFRA-0006] — user documentation **content** (written into this structure).
- [INFRA-0005] — the distribution zip; reuse its install steps in `getting-started`.

### Affected files (expected)

- new: `docusaurus.config.js`, `sidebars.js`, `.github/workflows/docs.yml`, `docs/**` (portal pages).
- moved: `docs/{architecture,conventions,git-workflow,testing}.md`, `docs/issues/` → `dev/`.
- edited: `CLAUDE.md`, `.claude/**`, `dev/issues/README.md` (path references).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
