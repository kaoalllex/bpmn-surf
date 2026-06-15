'use strict';

// Guards the four path registries that must stay in sync by hand (see
// docs/architecture.md): manifest.json#content_scripts (order matters) and
// #web_accessible_resources, utils.js#loadScripts (order matters) and
// test/support/scope.js#SCOPE_FILES. A drift here breaks the extension
// silently at runtime (chrome.runtime.getURL returns empty) while unit tests
// stay green — so this is the cheapest, highest-value structural guard.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    exists,
    listSrcJsFiles,
    manifestRegistries,
    loadScriptsRegistry,
    scopeFilesRegistry
} = require('../support/source-tree.js');

const { contentScripts, webAccessibleResources } = manifestRegistries();
const loadScripts = loadScriptsRegistry();
const scopeFiles = scopeFilesRegistry();
const srcJsFiles = listSrcJsFiles();

const isDifferJs = p => p.startsWith('src/differ/') && p.endsWith('.js');
const isProjectResource = p => p.startsWith('src/') || p.startsWith('libs/');

describe('registries: referenced files exist on disk', () => {
    const cases = [
        ['manifest content_scripts', contentScripts],
        ['manifest web_accessible_resources', webAccessibleResources.filter(isProjectResource)],
        ['utils.js#loadScripts', loadScripts.filter(isProjectResource)],
        ['scope.js#SCOPE_FILES', scopeFiles]
    ];
    for (const [label, entries] of cases) {
        for (const entry of entries) {
            it(`${label}: ${entry} exists`, () => {
                assert.ok(exists(entry), `${entry} is referenced in ${label} but missing on disk`);
            });
        }
    }
});

describe('registries: content-scope files are all registered in content_scripts', () => {
    // Content scripts run on GitLab pages: everything under src/content/ plus
    // the cross-scope core files. Each must be listed in manifest content_scripts.
    const contentScopeFiles = srcJsFiles.filter(
        p => p.startsWith('src/content/') || p.startsWith('src/core/')
    );
    for (const file of contentScopeFiles) {
        it(`${file} is in content_scripts`, () => {
            assert.ok(
                contentScripts.includes(file),
                `${file} is a content-scope source file but not listed in manifest#content_scripts`
            );
        });
    }
});

describe('registries: differ-page scripts match across loadScripts and web_accessible_resources', () => {
    const differOnDisk = srcJsFiles.filter(isDifferJs).sort();
    const differInLoad = loadScripts.filter(isDifferJs);
    const differInWar = webAccessibleResources.filter(isDifferJs);

    it('every differ-page source file is in loadScripts', () => {
        const missing = differOnDisk.filter(f => !differInLoad.includes(f));
        assert.deepEqual(missing, [], `differ files missing from utils.js#loadScripts: ${missing}`);
    });

    it('every differ-page source file is in web_accessible_resources', () => {
        const missing = differOnDisk.filter(f => !differInWar.includes(f));
        assert.deepEqual(missing, [], `differ files missing from manifest#web_accessible_resources: ${missing}`);
    });

    it('loadScripts has no differ file that is absent on disk', () => {
        const orphan = differInLoad.filter(f => !differOnDisk.includes(f));
        assert.deepEqual(orphan, [], `loadScripts references non-existent differ files: ${orphan}`);
    });

    it('differ files keep the same relative order in loadScripts and web_accessible_resources', () => {
        // Load order encodes dependencies (a class must load before its users);
        // web_accessible_resources should mirror it so the two never diverge.
        assert.deepEqual(differInLoad, differInWar);
    });
});

describe('registries: SCOPE_FILES is a curated subset of source files', () => {
    // scope.js runs production files in a jsdom vm. It is intentionally a subset
    // (self-executing bpmn-differ.js/dmn-differ.js and some DOM/lib-heavy files
    // are excluded — see source-layout.test.js for the by-design untested set),
    // but every entry must still be a real source file.
    for (const file of scopeFiles) {
        it(`${file} is an existing source file`, () => {
            assert.ok(file.startsWith('src/'), `SCOPE_FILES entry is not under src/: ${file}`);
            assert.ok(exists(file), `SCOPE_FILES references a missing file: ${file}`);
        });
    }

    it('does not include the self-executing differ entrypoints', () => {
        // These call main() on load and would fire on every createScope().
        assert.ok(!scopeFiles.includes('src/differ/bpmn/bpmn-differ.js'));
        assert.ok(!scopeFiles.includes('src/differ/dmn/dmn-differ.js'));
    });
});
