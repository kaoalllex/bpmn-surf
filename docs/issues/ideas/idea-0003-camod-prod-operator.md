---
id: IDEA-0003
title: CamOD — Camunda Operator Desktop (prod-runtime admin, separate product)
priority: low
status: open
---

## Statement

A separate product idea: an admin/operator surface for **viewing how processes
run in production** — built on top of the schema-browsing foundation, but pointed
at runtime data rather than at a git repository. Working name **CamOD** (Camunda
Operator Desktop; a pun on Russian "komod"/chest of drawers).

The idea is to reuse the existing diagram rendering + handler navigation and
overlay live runtime state: process instances, incidents, current tokens,
variable values, history — letting an operator see "how it actually works on
prod" against the same schema they browse in the repo.

## Context

- ⚠️ **Different product scope, not an extension of `bpmn-surf`.** Today's tool is
  a Chrome extension that reads BPMN/DMN from a GitLab repo with **no backend and
  no runtime access**. A prod-operator view needs the opposite: a connection to
  the engine (Camunda Engine REST API — instances, incidents, history),
  authentication, and access into prod. That implies a backend and a security
  model the current extension deliberately avoids.
- Naming note (2026-06-18): the "Camunda Operator Desktop" name was deliberately
  **not** chosen for the main tool — it couples to a vendor (Camunda) and to a
  runtime/operator role the repo-browsing tool does not have. If this idea
  becomes real, the CamOD name fits *it*. Main tool renamed to `bpmn-surf` — see
  [UX-0009].
- Reuses concepts from the browsing-first shift: [FEAT-0023] (dive in / back),
  [FEAT-0005] (called DMN). Possibly shares the rendering layer.
- Open questions before this is more than an idea: which engine(s) to target
  (Camunda 7 vs 8), where the backend lives, auth into prod, whether it stays a
  browser extension at all or becomes a standalone app.

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
