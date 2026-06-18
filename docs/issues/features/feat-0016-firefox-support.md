---
id: FEAT-0016
title: FireFox support
priority: low
status: open
---

## Statement

Make the extension work not only in Chrome but also in FireFox.

## Context

- Currently the extension is a Chrome Extension (Manifest V3), relying on the `chrome.*` API.
- An abstraction/polyfill of the browser API (`chrome` ↔ `browser`) will be needed, plus a check of MV3 compatibility in FireFox.
- Orthogonal to [REFAC-0004] (abstraction of the code storage platform GitLab→GitHub — that's about the data source, not the browser).

## Work log

<!-- Each AI session on the task is a separate entry per the template below.
     Add new entries at the top (freshest first). -->
