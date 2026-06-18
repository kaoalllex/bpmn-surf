---
id: REFAC-0012
title: Audit fragile heuristics — find them, replace with something reliable or guard + log
priority: medium
status: open
---

## Statement

The project has places where a value is derived by a **heuristic/guess** instead of
a reliable source, and when the assumption does not hold the code silently yields an incorrect
result (with no explicit error). [BUG-0012] is a clear example: parsing the blob-URL
guessed the `ref`/`path` boundary with a greedy regex and an anchor on the project name, and as a result the `ref`
got glued to the path, and it had to be diagnosed from the network log.

We need to:
1. **Find** similar fragile places (heuristics, guessing, regex over URL/DOM,
   assumptions about the structure of GitLab paths/markup).
2. For each, determine:
   - whether there is a **reliable deterministic source** (API, an explicit attribute, an exact
     format) — then replace the heuristic with it;
   - if there is no way around a heuristic — add a **guard mechanism** (validating the result,
     checking an invariant: "ref is a hex-SHA or a known branch", "filePath is not
     empty", etc.) **+ explicit logging** (`console.warn`/`error` with the input
     data), so the cause is visible immediately rather than inferred from the network log.

The goal is not to rewrite everything, but to compile a prioritized list with tentative
solution options; introduce pinpoint fixes as separate tasks as the analysis proceeds.

## Context

Known candidates (a starting point, the list to be extended during the audit):

- `GitLabUrlParser.extractBranchCommitIdAndFilePath`
  (`src/content/providers/gitlab/gitlab-url-parser.js`) — a greedy catch-all regex and
  an anchor on `projectName`; the ref/path boundary cannot be reliably derived from the URL (branches contain
  `/`). Reliance on a DOM hint that may be `null`. See [BUG-0012].
- `GitLabDomScraper` (`src/content/providers/gitlab/gitlab-dom-scraper.js`) — the entire
  parsing of GitLab markup: `findBranchCommitIdText` (two case selectors),
  `findSelectedFilePath`, `getMergeRequestBranchNames`, `findDiffHeadSha`,
  `isMergedByBadge`. The most fragile part (breaks with GitLab updates); on
  a non-match it often returns `null` silently.
- Resolving the target-version commit for a merged MR (historically went through the DOM —
  see [REFAC-0008]) — check for residual heuristics.
- `HandlerLocator` — matching handlers by **simple** class name rather than FQN
  (collisions of `class:Bar`); deriving the topic from the class name for `@ExternalTaskBean`;
  deriving bean→class by the default Spring convention
  (`src/differ/navigation/handler-locator.js`, see its header comment about
  known limitations). The heuristics are deliberate — there should be at least a log on ambiguity.
- Resolving the called-process file of a Call Activity by processId
  (see [BUG-0006], [REFAC-0007]).

Related: [BUG-0012] (the root-cause example), [REFAC-0008] (extraction of the DOM commit resolution).

## Work log

<!-- Each AI session on the task is a separate entry. New entries on top. -->
