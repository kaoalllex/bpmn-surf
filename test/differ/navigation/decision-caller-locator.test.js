'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { DecisionCallerLocator } = createScope();

// Objects returned by the in-context locator carry that realm's prototypes, so
// assert.deepEqual would reject them — compare via length and field access.
describe('DecisionCallerLocator.selectCallers', () => {
    it('returns [] when items is not an array', () => {
        assert.equal(DecisionCallerLocator.selectCallers(null, 'a.bpmn').length, 0);
        assert.equal(DecisionCallerLocator.selectCallers(undefined, 'a.bpmn').length, 0);
    });

    it('returns [] for an empty list', () => {
        assert.equal(DecisionCallerLocator.selectCallers([], 'a.bpmn').length, 0);
    });

    it('keeps only BPMN files (the callers are BPMN, the decision is DMN)', () => {
        const items = [
            { path: 'src/Caller.kt' },
            { path: 'README.md' },
            { path: 'dmn/Self.dmn' },
            { path: 'bpmn/Caller.bpmn' }
        ];
        const res = DecisionCallerLocator.selectCallers(items, 'dmn/Self.dmn');
        assert.equal(res.length, 1);
        assert.equal(res[0].filePath, 'bpmn/Caller.bpmn');
        assert.equal(res[0].fileName, 'Caller.bpmn');
    });

    it('excludes the current file itself', () => {
        const items = [
            { path: 'bpmn/Self.bpmn' },
            { path: 'bpmn/Caller.bpmn' }
        ];
        const res = DecisionCallerLocator.selectCallers(items, 'bpmn/Self.bpmn');
        assert.equal(res.length, 1);
        assert.equal(res[0].filePath, 'bpmn/Caller.bpmn');
    });

    it('de-duplicates by path (a file may match more than once)', () => {
        const items = [
            { path: 'bpmn/Caller.bpmn' },
            { path: 'bpmn/Caller.bpmn' }
        ];
        const res = DecisionCallerLocator.selectCallers(items, 'dmn/Self.dmn');
        assert.equal(res.length, 1);
    });

    it('derives the file name from the path basename', () => {
        const res = DecisionCallerLocator.selectCallers([{ path: 'a/b/c/Caller.bpmn' }], 'self.dmn');
        assert.equal(res[0].fileName, 'Caller.bpmn');
    });

    it('tolerates null items and items without a path', () => {
        const items = [null, {}, { path: 'bpmn/Caller.bpmn' }];
        const res = DecisionCallerLocator.selectCallers(items, 'self.dmn');
        assert.equal(res.length, 1);
        assert.equal(res[0].filePath, 'bpmn/Caller.bpmn');
    });
});

describe('DecisionCallerLocator.blobSearchPageUrl', () => {
    const locator = new DecisionCallerLocator(
        'https://gitlab.example/group/proj',
        'https://gitlab.example',
        42
    );

    it('builds a decisionRef blob search page URL', () => {
        assert.equal(
            locator.blobSearchPageUrl('ScoreCar', 'main'),
            'https://gitlab.example/group/proj/-/search' +
            '?search=decisionRef%3D%22ScoreCar%22&scope=blobs&ref=main'
        );
    });

    it('url-encodes the decision id and ref', () => {
        assert.equal(
            locator.blobSearchPageUrl('Some Decision', 'feature/x'),
            'https://gitlab.example/group/proj/-/search' +
            '?search=decisionRef%3D%22Some%20Decision%22&scope=blobs&ref=feature%2Fx'
        );
    });
});

describe('DecisionCallerLocator.resolveCallers (guards, no network)', () => {
    const locator = new DecisionCallerLocator('https://gitlab.example/p', 'https://gitlab.example', 1);

    it('returns [] for no decision ids', async () => {
        assert.equal((await locator.resolveCallers([], 'main', 'self.dmn')).length, 0);
        assert.equal((await locator.resolveCallers(null, 'main', 'self.dmn')).length, 0);
    });

    it('returns [] when the ref is missing', async () => {
        assert.equal((await locator.resolveCallers(['D1'], null, 'self.dmn')).length, 0);
    });

    it('ignores empty/falsy ids', async () => {
        assert.equal((await locator.resolveCallers(['', null], 'main', 'self.dmn')).length, 0);
    });
});
