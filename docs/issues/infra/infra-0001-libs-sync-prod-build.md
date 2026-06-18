---
id: INFRA-0001
title: Mechanism for pulling in libraries and production build
priority: medium
status: open
---

## Statement

- Pull libraries via package.json/node.
- Remove unnecessary library files, replace the used ones with minified versions (minify the properties panel library and the plugin scripts).
- Currently dmn-js is included as a dev build (`dmn-viewer.development.js`): on production.min the error `It looks like you're using a minified copy of the development build of Inferno...` occurs — figure this out when switching to minified libraries.

## Context

- Code: `utils.js` (inclusion of `dmn-viewer.development.js`).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (most recent first). -->
