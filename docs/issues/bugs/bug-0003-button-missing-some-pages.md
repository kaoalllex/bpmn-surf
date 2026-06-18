---
id: BUG-0003
title: BPMN Diff button is not shown on some pages
priority: high
status: open
---

## Statement

Find and fix the detection problems for eligible GitLab pages; add diagnostics for the reasons the button is hidden.

## Context

- Special case: when the "Show one file at a time" checkbox is unchecked, GitLab shows all files in a row, and the plugin does not understand that a bpmn/dmn file is selected → there is no button. The button must be drawn immediately for all bpmn/dmn file blocks.
- Original bug: https://chat.example.com/example/pl/hzu9eoc44384xq4jk6a1apna8a

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
