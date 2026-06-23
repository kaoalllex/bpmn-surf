---
id: INFRA-0009
title: Docs portal — publish user documentation via AutoDoc
priority: medium
status: open
---

## Statement

Stand up a **published documentation portal** for the plugin, for internal company
use now, while keeping the source portable for a later move to public GitHub.

Decision (analysis done 2026-06-23): use **AutoDoc** (`unic/autodoc`) as the
publishing layer now. AutoDoc is a managed Docusaurus — same engine, same
Markdown/MDX source in `docs/`, wrapped in a ready template + GitLab CI +
GitLab Pages + search + feedback widget + MR preview. So the choice is not
"AutoDoc vs Docusaurus" — they are the same engine; only the publishing layer
differs. Three layers, kept separate:

| Layer | Now (internal) | After move to GitHub |
|-------|----------------|----------------------|
| Source | Markdown in this repo | same files, unchanged |
| Publish | AutoDoc → GitLab Pages | vanilla Docusaurus → GitHub Pages |

This task covers the **portal / delivery mechanism** (repo structure, config, CI,
publishing). The **content** of the docs (installation, capabilities, how-to) is
[INFRA-0006] — written as portable Markdown into the structure defined here.

## Context

### Repo structure (variant A — chosen)

`docs/` becomes **the portal root: everything under it is published**. The
existing internal material (dev docs + task backlog) moves **out** of `docs/`
into a new top-level `dev/`, so AutoDoc never sees it.

Why move it out rather than hide it via `sidebars.js`: AutoDoc's `auto-doc.json`
sets `"onBrokenMarkdownLinks": "throw"`. The dev docs and `issues/` files contain
relative links to each other and to code — if they were built as pages, the PROD
build would fail. They must be **physically excluded** from the build, not just
unlisted. Moving them outside `docs/` is the most robust exclusion (does not
depend on the Docusaurus `_`-prefix default of the AutoDoc image).

Proposed layout:

```
bpmn-surf/
├── auto-doc.json              # NEW  portal config (title, feedback, links)
├── .gitlab-ci.yml             # NEW  include unic/autodoc@3.x /autodoc.yml (none today)
├── run-local.sh               # NEW  local docker preview (optional)
│
├── docs/                      # PORTAL ROOT — everything here is published
│   ├── index.md               #   landing: what bpmn-surf is, 1-screen overview
│   ├── getting-started/
│   │   ├── installation.md     #   reuse install steps from [INFRA-0005]
│   │   └── quick-start.md
│   ├── features/              #   grouped from README features
│   │   ├── comparing-changes.md
│   │   ├── browsing-navigation.md
│   │   ├── reading-a-diagram.md
│   │   └── versions-and-viewport.md
│   ├── guides/                #   task-oriented how-tos (later)
│   └── faq.md
│
└── dev/                       # OUTSIDE docs/ — AutoDoc does not see it
    ├── architecture.md         #   moved from docs/
    ├── conventions.md
    ├── git-workflow.md
    ├── testing.md
    └── issues/                 #   whole task backlog, moved as-is
```

### Portability constraints (keep the GitHub move cheap)

- Keep front-matter standard (`title`, `sidebar_position`) and image paths relative.
- Avoid AutoDoc-/company-specific MDX components and internal diagram hosts
  (Kroki/PlantUML on internal servers) — otherwise they need rework on GitHub.
- Later, a "Contributors" portal section is possible by lifting selected files
  from `dev/` into `docs/contributing/` — it is just Markdown.

### Reference updates required by the `dev/` move (~11 files)

Moving `docs/{architecture,conventions,git-workflow,testing}.md` and
`docs/issues/` → `dev/...` breaks path references in: `CLAUDE.md`, several
`.claude/` skills/agents/commands (`fix`, `refactor`, `feature`, `analyze`,
`code-reviewer`, `code-explorer`, `release`, `mr`, `cleanup`), and
`docs/issues/README.md` (→ `dev/issues/README.md`). Inter-task links go by code
(`[BUG-0001]`), so issue cross-links survive the move. Use `git mv`.

### Open question — left open for now

The repo lives in a **personal namespace** (`gitlab.example.com/kaoalllex/bpmn-surf`).
AutoDoc publishes to `https://{tenant}.pages.example.com/{repo}/`, and a
personal namespace is likely **not** a valid devplatform Pages tenant — so AutoDoc
may have nowhere to deploy until the repo moves under a proper group/tenant. Ask the
AutoDoc team (`~example-pipelines` in the chat) whether personal namespaces are supported.
This ties into [INFRA-0007] (move under a tenant / to GitHub).

### Relations

- [INFRA-0006] — user documentation **content** (written into this structure).
- [INFRA-0007] — repo migration / going public; the tenant question and the
  eventual switch AutoDoc → vanilla Docusaurus on GitHub Pages belong with it.
- [INFRA-0005] — distribution build; reuse its install steps in `getting-started`.
- [UX-0009] — `bpmn-surf` rebrand; portal title/branding should match.

### Affected files (expected)

- new: `auto-doc.json`, `.gitlab-ci.yml`, `run-local.sh`, `docs/**` (portal pages).
- moved: `docs/{architecture,conventions,git-workflow,testing}.md`, `docs/issues/` → `dev/`.
- edited: `CLAUDE.md`, `.claude/**`, `dev/issues/README.md` (path references).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
