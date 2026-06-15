'use strict';

// Enforces the structural conventions from docs/architecture.md and
// docs/testing.md: file basenames are unique across the whole src/ tree, and
// every source file either has a mirror test (test/<path>/<name>.test.js) or is
// listed in the by-design untested set below. A new source file thus forces a
// conscious decision — write a test, or record why not — instead of silently
// growing the untested surface.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { exists, listSrcJsFiles } = require('../support/source-tree.js');

// Source files intentionally without a unit test, with the reason. Keep this
// list shrinking: when you add a test for one of these, remove it here (a stale
// entry fails the "no stale entries" check below). Categories:
//  - orchestrators / DOM+lib glue: heavy bpmn-js/dmn-js and DOM coupling, low
//    unit-test ROI; covered by manual differ checklist (docs/testing.md).
//  - trivial: DTOs / constants / entrypoints with no logic to exercise.
//  - global-coupled: logic worth testing but bound to fetch/localStorage/
//    location without DI yet — tracked as test debt (see docs/issues).
const UNTESTED_BY_DESIGN = new Set([
    // trivial
    'src/core/config.js',
    'src/core/models.js',
    'src/content/main.js',
    'src/content/camunda-bpmn-moddle-manager.js',
    'src/content/providers/repo-provider.js',
    'src/content/providers/ui-repo-provider.js',
    'src/content/providers/repo-provider-factory.js',
    'src/differ/shared/diff-type.js',
    // orchestrators / DOM+lib glue
    'src/content/app.js',
    'src/differ/bpmn/bpmn-differ.js',
    'src/differ/bpmn/bpmn-differ-view.js',
    'src/differ/bpmn/diff-highlighter.js',
    'src/differ/bpmn/canvas-viewport.js',
    'src/differ/bpmn/changes-table-view.js',
    'src/differ/dmn/dmn-differ.js',
    'src/differ/dmn/dmn-differ-view.js',
    'src/differ/dmn/dmn-table-viewport.js',
    'src/differ/shared/diagram-versions.js',
    'src/differ/shared/branch-indicator.js',
    'src/differ/navigation/call-activity-navigator.js',
    'src/differ/navigation/handler-navigator.js',
    // doomed (slated for removal once primary paths are proven)
    'src/differ/navigation/process-file-index.js',
    // global-coupled test debt
    'src/content/providers/gitlab/master-commit-manager.js'
]);

function mirrorTestPath(srcFile) {
    // src/<path>/<name>.js -> test/<path>/<name>.test.js
    const rel = srcFile.replace(/^src\//, '');
    const dir = path.posix.dirname(rel);
    const base = path.posix.basename(rel, '.js');
    return path.posix.join('test', dir, `${base}.test.js`);
}

const srcJsFiles = listSrcJsFiles();

describe('source layout: basenames are unique across src/', () => {
    const seen = new Map();
    for (const file of srcJsFiles) {
        const base = path.posix.basename(file);
        const prev = seen.get(base);
        it(`${base} is unique`, () => {
            assert.equal(prev, undefined,
                `duplicate basename ${base}: ${prev} and ${file} — the mirror test layout relies on unique names`);
        });
        if (!prev) seen.set(base, file);
    }
});

describe('source layout: every source file is tested or explicitly untested', () => {
    for (const file of srcJsFiles) {
        if (UNTESTED_BY_DESIGN.has(file)) continue;
        it(`${file} has a mirror test`, () => {
            const testFile = mirrorTestPath(file);
            assert.ok(exists(testFile),
                `${file} has no test at ${testFile}; add one or list it in UNTESTED_BY_DESIGN with a reason`);
        });
    }
});

describe('source layout: the untested-by-design list has no stale entries', () => {
    for (const file of UNTESTED_BY_DESIGN) {
        it(`${file} still exists and is still untested`, () => {
            assert.ok(exists(file), `UNTESTED_BY_DESIGN lists a missing file: ${file}`);
            const testFile = mirrorTestPath(file);
            assert.ok(!exists(testFile),
                `${file} now has a test at ${testFile}; remove it from UNTESTED_BY_DESIGN`);
        });
    }
});
