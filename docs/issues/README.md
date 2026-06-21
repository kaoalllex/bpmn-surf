# bpmn-surf tasks — format and rules

The backlog is stored **one file per task**. This gives pinpoint reading (the agent opens only the needed task, not the whole list), an independent history for each task, and clean git diffs.

## Where things live

```
docs/issues/
  README.md          # this file — format and rules (read before working with tasks)
  bugs/              # codes BUG-NNNN     — active (open / in-progress / partial)
  features/          # codes FEAT-NNNN
  ux/                # codes UX-NNNN
  refactor/          # codes REFAC-NNNN
  infra/             # codes INFRA-NNNN
  perf/              # codes PERF-NNNN
  ideas/             # codes IDEA-NNNN
  archive/           # fully closed (status: done), the same breakdown by type inside
    bugs/  features/  ux/  refactor/  infra/  perf/  ideas/
```

**Active backlog** = everything that lies **outside** `archive/` (statuses `open` / `in-progress` / `partial`). **Archive** (`archive/<type>/`) — only fully completed tasks (`status: done`). Partially done ones (`partial`) stay in the active zone — the work is not finished.

The task type is determined by the folder (with an adjustment for `archive/`) and the code prefix — there is no separate `type` field in the frontmatter. Moving a file does not break links: links between tasks go by code (`[BUG-0001]`), not by path.

File name: `<code in lowercase>-<short-english-slug>.md`, e.g. `bug-0001-diff-deleted-in-both.md`. The canonical code (`BUG-0001`) is stored in the frontmatter, the file name is derived, kebab-case, ASCII.

## Task file format

```markdown
---
id: BUG-0001
title: Short task title
priority: high     # high | medium | low
status: open       # open | in-progress | partial | done
---

## Statement

What is wrong / what needs to be done. The essence of the task without history.

## Context

Links to MRs, logs, symptoms, affected files, links with other tasks
(`[BUG-0001]`, `[FEAT-0003]` — by code, with a link to the file if needed).

## Work log

<!-- Each AI session on the task — a separate entry by the template below.
     Add new entries on top (freshest first). -->
```

### Work log entry

The entry header carries the **artifacts of the AI's work** (the minimal set): model · date · commit/branch.

```markdown
### 2026-06-14 · claude-opus-4-8 · `abcdef1` (branch `feature/foo`)

What was done in this session: the essence of the change, key files, what remains.
```

- **date** — in the format `YYYY-MM-DD`;
- **model** — the exact id (`claude-opus-4-8`, `claude-sonnet-4-6`, …); for entries carried over from the old `ISSUES.md` before tracking was introduced, put `—`;
- **commit** — short SHA with a link if available; if there is no commit yet (work in a branch) — specify the branch.
- Tokens and session time are **not** recorded: the agent does not get them reliably. If needed, they are added manually.

## Rules for working with tasks

1. **Creating.** A new task → a new file in the folder of its type with the next free number in that group. The number is searched across **both zones** (the active one and `archive/<type>/`), so that codes are not reused. Fill in the `Statement` and `Context`; `status: open`; leave the `Work log` empty.
2. **During work.** When taking on a task — `status: in-progress`. On completion — `done`; if part is done and the rest is deliberately postponed — `partial` (in the `Context`/`Work log` explicitly list what remains).
3. **Moving to the archive.** As soon as `status: done` is set — move the file to `archive/<type>/` with the same `git mv` (the file name and code do not change). `partial` is **not** moved to the archive. If a task was reopened — return the file from `archive/<type>/` to the active folder and change the `status`.
4. **On completion of an AI session on a task** — add an entry to the `Work log` by the template above, update the `status` and (on `done`) move it to the archive. This requirement is enshrined in the `feature`/`fix`/`refactor` skills.
5. **Links** between tasks — by code (`[FEAT-0003]`), without duplicating the text.
6. **The index is not maintained by hand.** The active backlog is surveyed by listing the folders outside `archive/`; fine filtering — by searching the frontmatter:
   ```
   grep -rn "^title:\|^status:\|^priority:" docs/issues --exclude-dir=archive
   ```
   Remove `--exclude-dir=archive` to also capture the closed ones.

## Related materials

- **Analysis of analogues** (other BPMN plugins): https://chat.example.com/example/pl/mubj8tqxsprcxft8r1dny4k4ph
- **A separate BPMN viewing system**: https://metrics.example.com
- **BPMN Diff for CI/CD** (gradle-plugin): https://gitlab.example.com/example-tools/bpmn-diff-gradle-plugin
  - Discussion: https://chat.example.com/example/pl/dk3pocadipbs7nzpwo3h617yne
- **BPMN viewer plugin in GitLab**: https://gitlab.example.com/example-infra/gitlab-bpmn-viewer
