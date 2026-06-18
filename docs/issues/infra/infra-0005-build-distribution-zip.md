---
id: INFRA-0005
title: Building a version distribution (zip)
priority: medium
status: open
---

## Statement

Build a version distribution — a zip archive containing only the files needed for the plugin to work (without dev files, tests, documentation sources, etc.). Installation for the user: unpack the archive and load it as **Load unpacked**.

## Context

- Defines *what exactly* the distribution is (format and contents) — what [INFRA-0002] is expected to "build", and what [INFRA-0001] prepares at the asset level (minifying libraries, removing unnecessary library files).
- Related to [INFRA-0001] (production build of assets) and [INFRA-0002] (running the build in CI on merge into master).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
