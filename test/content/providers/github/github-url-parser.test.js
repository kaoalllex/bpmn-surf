'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { GitHubUrlParser, FILE_TYPE_BPMN, FILE_TYPE_DMN } = createScope();
const parser = new GitHubUrlParser();
const plain = (o) => JSON.parse(JSON.stringify(o));

describe('GitHubUrlParser.parsePullFiles', () => {
    it('parses the classic and the new Files changed URLs', () => {
        for (const tab of ['files', 'changes', 'files/', 'changes?diff=split', 'files#diff-abc']) {
            assert.deepEqual(plain(parser.parsePullFiles(`https://github.com/acme/flows/pull/42/${tab}`)),
                { owner: 'acme', repo: 'flows', number: 42, range: null }, tab);
        }
    });

    it('rejects every other PR or repository page', () => {
        for (const path of [
            'acme/flows/pull/42', 'acme/flows/pull/42/commits', 'acme/flows/pull/42/commits/abc123',
            'acme/flows/pull/42/files/abc123..def456', 'acme/flows/pull/42/changes/abc123',
            'acme/flows', 'acme/flows/issues/42', 'acme/flows/pulls', 'acme/flows/pull/x/files'
        ]) {
            assert.equal(parser.parsePullFiles(`https://github.com/${path}`), null, path);
        }
    });
});

describe('GitHubUrlParser.parsePullFiles — commit and range views', () => {
    const p = new (createScope().GitHubUrlParser)();
    const A = 'a'.repeat(40), B = 'b'.repeat(40);
    for (const [path, range] of [
        ['/acme/flows/pull/9/changes', null],
        ['/acme/flows/pull/9/files/', null],
        [`/acme/flows/pull/9/changes/${A}`, A],
        [`/acme/flows/pull/9/changes/${A}..${B}`, `${A}..${B}`],
        [`/acme/flows/pull/9/changes/BASE..${B}`, `BASE..${B}`],
        [`/acme/flows/pull/9/files/${A}..${B}`, `${A}..${B}`],
        [`/acme/flows/pull/9/commits/${A}`, A],
        ['/acme/flows/pull/9/files/1499620', '1499620']
    ]) {
        it(`reads ${path}`, () => {
            assert.deepEqual({ ...p.parsePullFiles(`https://github.com${path}`) }, { owner: 'acme', repo: 'flows', number: 9, range });
        });
    }
    for (const path of ['/acme/flows/pull/9/commits', '/acme/flows/pull/9/changes/main', '/acme/flows/pull/9/changes/a..b/x', '/acme/flows/pull/9']) {
        it(`rejects ${path}`, () => assert.equal(p.parsePullFiles(`https://github.com${path}`), null));
    }
});

describe('GitHubUrlParser.parseBlob', () => {
    it('returns the decoded ref-and-path remainder', () => {
        assert.deepEqual(
            plain(parser.parseBlob('https://github.com/acme/flows/blob/feature/x/My%20Flows/order.bpmn?plain=1#L3')),
            { owner: 'acme', repo: 'flows', refAndPath: 'feature/x/My Flows/order.bpmn' });
    });

    it('returns null when the path cannot be decoded', () => {
        assert.equal(parser.parseBlob('https://github.com/a/r/blob/main/%E0%A4%A.bpmn'), null);
    });

    it('returns null off blob pages', () => {
        assert.equal(parser.parseBlob('https://github.com/acme/flows/tree/main/dir'), null);
        assert.equal(parser.parseBlob('https://github.com/acme/flows/pull/1/files'), null);
    });
});

describe('GitHubUrlParser.getBranchFileType', () => {
    it('detects bpmn and dmn blobs only', () => {
        assert.equal(parser.getBranchFileType('https://github.com/a/r/blob/main/x/p.bpmn'), FILE_TYPE_BPMN);
        assert.equal(parser.getBranchFileType('https://github.com/a/r/blob/main/x/d.dmn?plain=1'), FILE_TYPE_DMN);
        assert.equal(parser.getBranchFileType('https://github.com/a/r/blob/main/x/readme.md'), null);
        assert.equal(parser.getBranchFileType('https://github.com/a/r/pull/1/files'), null);
    });
});

describe('GitHubUrlParser.splitRefAndPath', () => {
    it('cuts a slashed ref off the front', () => {
        assert.equal(parser.splitRefAndPath('feature/x/dir/p.bpmn', 'feature/x'), 'dir/p.bpmn');
    });

    it('returns null when the ref does not prefix the remainder', () => {
        assert.equal(parser.splitRefAndPath('main/dir/p.bpmn', 'feature/x'), null);
        assert.equal(parser.splitRefAndPath('main', 'main'), null);
    });
});

describe('GitHubUrlParser API urls', () => {
    it('builds the REST endpoints', () => {
        assert.equal(parser.pullApiUrl('acme', 'flows', 42), 'https://api.github.com/repos/acme/flows/pulls/42');
        assert.equal(parser.compareApiUrl('acme', 'flows', 'b1', 'h2'),
            'https://api.github.com/repos/acme/flows/compare/b1...h2');
    });
});
