'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

// GitLabRepoProvider reads the realm's global document/window, so each test
// gets a fresh scope and sets up the diff markup on it.

// Builds rapid-diffs (<diff-file>) markup the way gitlab.com serves it:
// data-file-data is an HTML-entity-escaped JSON string.
// files: array of { id, newPath?, oldPath? }
function rapidDiffsMarkup(files) {
    return files.map(f => {
        const data = {};
        if ('newPath' in f) data.new_path = f.newPath;
        if ('oldPath' in f) data.old_path = f.oldPath;
        const escaped = JSON.stringify(data).replace(/"/g, '&quot;');
        return `<diff-file id="${f.id}" data-file-data="${escaped}"></diff-file>`;
    }).join('\n');
}

// Builds a broken <diff-file> whose data-file-data is not valid JSON.
function brokenDiffFile(id) {
    return `<diff-file id="${id}" data-file-data="{not-json"></diff-file>`;
}

function createProvider() {
    const scope = createScope();
    const provider = new scope.GitLabRepoProvider();
    return { scope, provider };
}

describe('GitLabRepoProvider.findSelectedFilePath — legacy UI', () => {
    it('returns the path of the file marked diff-file-is-active', async () => {
        const { scope, provider } = createProvider();
        scope.document.body.innerHTML = `
            <div data-path="docs/readme.md"></div>
            <div data-path="process.bpmn" class="diff-file-is-active"></div>`;

        assert.equal(await provider.findSelectedFilePath(), 'process.bpmn');
    });

    it('returns the path of the file marked is-active', async () => {
        const { scope, provider } = createProvider();
        scope.document.body.innerHTML = `
            <div data-path="a.bpmn"></div>
            <div data-path="b.bpmn" class="is-active"></div>`;

        assert.equal(await provider.findSelectedFilePath(), 'b.bpmn');
    });

    it('returns null when a data-path element exists but none is active', async () => {
        const { scope, provider } = createProvider();
        scope.document.body.innerHTML = `<div data-path="process.bpmn"></div>`;

        assert.equal(await provider.findSelectedFilePath(), null);
    });
});

describe('GitLabRepoProvider.findSelectedFilePath — rapid diffs UI', () => {
    it('returns the file explicitly selected via URL hash', async () => {
        const { scope, provider } = createProvider();
        scope.document.body.innerHTML = rapidDiffsMarkup([
            { id: 'id-a', newPath: 'first.bpmn' },
            { id: 'id-b', newPath: 'second.bpmn' }
        ]);
        scope.window.location.hash = 'id-b';

        assert.equal(await provider.findSelectedFilePath(), 'second.bpmn');
    });

    it('selection via hash wins even for a non-diagram file', async () => {
        const { scope, provider } = createProvider();
        scope.document.body.innerHTML = rapidDiffsMarkup([
            { id: 'id-doc', newPath: 'docs/readme.md' },
            { id: 'id-bpmn', newPath: 'process.bpmn' }
        ]);
        scope.window.location.hash = 'id-doc';

        assert.equal(await provider.findSelectedFilePath(), 'docs/readme.md');
    });

    it('falls back to the single bpmn/dmn file when nothing is explicitly selected', async () => {
        const { scope, provider } = createProvider();
        scope.document.body.innerHTML = rapidDiffsMarkup([
            { id: 'id-doc', newPath: 'docs/readme.md' },
            { id: 'id-bpmn', newPath: 'process.bpmn' }
        ]);

        assert.equal(await provider.findSelectedFilePath(), 'process.bpmn');
    });

    it('also recognizes a single dmn file', async () => {
        const { scope, provider } = createProvider();
        scope.document.body.innerHTML = rapidDiffsMarkup([
            { id: 'id-dmn', newPath: 'decision.dmn' }
        ]);

        assert.equal(await provider.findSelectedFilePath(), 'decision.dmn');
    });

    it('returns null when several diagram files exist and none is selected', async () => {
        const { scope, provider } = createProvider();
        scope.document.body.innerHTML = rapidDiffsMarkup([
            { id: 'id-a', newPath: 'first.bpmn' },
            { id: 'id-b', newPath: 'second.bpmn' }
        ]);

        assert.equal(await provider.findSelectedFilePath(), null);
    });

    it('uses old_path for a deleted file when new_path is absent', async () => {
        const { scope, provider } = createProvider();
        scope.document.body.innerHTML = rapidDiffsMarkup([
            { id: 'id-removed', oldPath: 'removed.bpmn' }
        ]);

        assert.equal(await provider.findSelectedFilePath(), 'removed.bpmn');
    });

    it('ignores a diff-file with broken data-file-data and still resolves the single diagram', async () => {
        const { scope, provider } = createProvider();
        scope.document.body.innerHTML =
            brokenDiffFile('id-broken') + '\n' +
            rapidDiffsMarkup([{ id: 'id-bpmn', newPath: 'process.bpmn' }]);

        assert.equal(await provider.findSelectedFilePath(), 'process.bpmn');
    });
});
