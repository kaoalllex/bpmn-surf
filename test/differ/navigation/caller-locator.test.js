'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { CallerLocator, GitLabPlatformClient } = createScope();

// A GitLab client over a fixed project, so blobSearchPageUrl asserts the real
// URL format the locator now delegates to (REFAC-0004).
const client = new GitLabPlatformClient({
    projectUrl: 'https://gitlab.example/group/proj',
    hostUrl: 'https://gitlab.example',
    projectId: 42
});

// Objects returned by the in-context locator carry that realm's prototypes, so
// assert.deepEqual would reject them — compare via length and field access.
describe('CallerLocator.selectCallers', () => {
    it('returns [] when items is not an array', () => {
        assert.equal(CallerLocator.selectCallers(null, 'a.bpmn').length, 0);
        assert.equal(CallerLocator.selectCallers(undefined, 'a.bpmn').length, 0);
    });

    it('returns [] for an empty list', () => {
        assert.equal(CallerLocator.selectCallers([], 'a.bpmn').length, 0);
    });

    it('keeps only BPMN files', () => {
        const items = [
            { path: 'src/Caller.kt' },
            { path: 'README.md' },
            { path: 'bpmn/Caller.bpmn' }
        ];
        const res = CallerLocator.selectCallers(items, 'bpmn/Self.bpmn');
        assert.equal(res.length, 1);
        assert.equal(res[0].filePath, 'bpmn/Caller.bpmn');
        assert.equal(res[0].fileName, 'Caller.bpmn');
    });

    it('excludes the current file itself', () => {
        const items = [
            { path: 'bpmn/Self.bpmn' },
            { path: 'bpmn/Caller.bpmn' }
        ];
        const res = CallerLocator.selectCallers(items, 'bpmn/Self.bpmn');
        assert.equal(res.length, 1);
        assert.equal(res[0].filePath, 'bpmn/Caller.bpmn');
    });

    it('de-duplicates by path (a file may match more than once)', () => {
        const items = [
            { path: 'bpmn/Caller.bpmn' },
            { path: 'bpmn/Caller.bpmn' }
        ];
        const res = CallerLocator.selectCallers(items, 'bpmn/Self.bpmn');
        assert.equal(res.length, 1);
    });

    it('derives the file name from the path basename', () => {
        const res = CallerLocator.selectCallers([{ path: 'a/b/c/Caller.bpmn' }], 'self.bpmn');
        assert.equal(res[0].fileName, 'Caller.bpmn');
    });

    it('tolerates null items and items without a path', () => {
        const items = [null, {}, { path: 'bpmn/Caller.bpmn' }];
        const res = CallerLocator.selectCallers(items, 'self.bpmn');
        assert.equal(res.length, 1);
        assert.equal(res[0].filePath, 'bpmn/Caller.bpmn');
    });
});

describe('CallerLocator.blobSearchPageUrl', () => {
    const locator = new CallerLocator(client);

    it('builds a calledElement blob search page URL', () => {
        assert.equal(
            locator.blobSearchPageUrl('PrepareItem', 'main'),
            'https://gitlab.example/group/proj/-/search' +
            '?search=calledElement%3D%22PrepareItem%22&scope=blobs&ref=main'
        );
    });

    it('url-encodes the process id and ref', () => {
        assert.equal(
            locator.blobSearchPageUrl('Some Process', 'feature/x'),
            'https://gitlab.example/group/proj/-/search' +
            '?search=calledElement%3D%22Some%20Process%22&scope=blobs&ref=feature%2Fx'
        );
    });
});

describe('CallerLocator.resolveCallers (guards, no network)', () => {
    const locator = new CallerLocator(client);

    it('returns [] for no process ids', async () => {
        assert.equal((await locator.resolveCallers([], 'main', 'self.bpmn')).length, 0);
        assert.equal((await locator.resolveCallers(null, 'main', 'self.bpmn')).length, 0);
    });

    it('returns [] when the ref is missing', async () => {
        assert.equal((await locator.resolveCallers(['P1'], null, 'self.bpmn')).length, 0);
    });

    it('ignores empty/falsy ids', async () => {
        assert.equal((await locator.resolveCallers(['', null], 'main', 'self.bpmn')).length, 0);
    });
});
