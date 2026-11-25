---
id: IDEA-0006
title: Show findings produced by external tools (SARIF)
priority: low
status: open
---

## Statement

Teams already run tools over their processes and handler code in CI: bpmnlint, custom
scripts, Java static analysis. The extension cannot load third-party code (Manifest V3), but
it can read their **results**. An external-findings analyzer for the core of [FEAT-0040]
reads a results file in **SARIF** — the standard format for static-analysis results, also
used by GitHub code scanning — and shows its results as findings on the diagram elements
they point to, with levels configurable per tool and rule in the profile like any other
analyzer.

Questions to answer before this becomes a feature:

- **Where the file comes from**: a fixed path in the repository at the head revision; a CI
  artifact of the merge request's pipeline (GitLab job artifacts, GitHub Actions artifacts —
  each needs its own API and permissions); or a local file the user drops in.
- **How a result points at an element**: SARIF locations are file + region (line/column);
  a BPMN element needs its id — via `logicalLocations` (e.g. `fullyQualifiedName` = element
  id) or a property bag. Define a small convention and publish it.
- **Levels**: SARIF `error` / `warning` / `note` map to Critical / Warning / Normal by
  default; per-rule overrides live in the profile.
- **Trust**: results come from the repository or its CI, i.e. from the code under review;
  they are shown as the tool's opinion, never as the extension's.
- **Privacy**: reading from the user's own host only — nothing is sent anywhere.

A later variant: another extension pushing findings through extension messaging — opt-in,
allowlisted extension ids, since the diagram would be shared with it.

## Context

GitHub: [#55](https://github.com/kaoalllex/bpmn-surf/issues/55)

Came from the design of [FEAT-0040] (analyzers → findings → profile → display): any source
that can produce findings fits, and SARIF lets tools the project will never integrate
directly take part. Related: [FEAT-0022] (built-in modelling rules), where reading a
repository's `.bpmnlintrc` was also considered.

## Work log

<!-- Each AI session on the task — a separate entry by the template below.
     Add new entries on top (freshest first). -->
