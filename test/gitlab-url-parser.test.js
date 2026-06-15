'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('./support/scope.js');

function createParser() {
    const scope = createScope();
    return { scope, parser: new scope.GitLabUrlParser() };
}

describe('GitLabUrlParser.parseProject', () => {
    it('parses url, host, group and name from a self-managed MR url', () => {
        const { parser } = createParser();
        const parsed = parser.parseProject('https://gitlab.example.com/group/proj/-/merge_requests/5/diffs');
        assert.deepEqual({ ...parsed }, {
            url: 'https://gitlab.example.com/group/proj',
            hostUrl: 'https://gitlab.example.com',
            groupName: 'group',
            name: 'proj'
        });
    });

    it('parses a nested-group url (host = url minus group/name)', () => {
        const { parser } = createParser();
        const parsed = parser.parseProject('https://gitlab.example.com/org/sub/proj/-/blob/master/a.bpmn');
        assert.deepEqual({ ...parsed }, {
            url: 'https://gitlab.example.com/org/sub/proj',
            hostUrl: 'https://gitlab.example.com/org',
            groupName: 'sub',
            name: 'proj'
        });
    });

    it('returns null when there is no /-/ marker', () => {
        const { parser } = createParser();
        assert.equal(parser.parseProject('https://gitlab.example.com/group/proj'), null);
    });

    it('returns null when the project url has fewer than 3 segments', () => {
        const { parser } = createParser();
        assert.equal(parser.parseProject('https:/x/-/blob/master/a.bpmn'), null);
    });
});

describe('GitLabUrlParser.extractMrIid', () => {
    it('extracts the iid from an MR diffs url', () => {
        const { parser } = createParser();
        assert.equal(parser.extractMrIid('https://gitlab.example.com/g/p/-/merge_requests/42/diffs'), '42');
    });

    it('extracts the iid when nothing follows it', () => {
        const { parser } = createParser();
        assert.equal(parser.extractMrIid('https://gitlab.example.com/g/p/-/merge_requests/7'), '7');
    });

    it('ignores query string and hash', () => {
        const { parser } = createParser();
        assert.equal(parser.extractMrIid('https://gitlab.example.com/g/p/-/merge_requests/9?tab=x#note_1'), '9');
    });

    it('returns null when the url is not an MR url', () => {
        const { parser } = createParser();
        assert.equal(parser.extractMrIid('https://gitlab.example.com/g/p/-/blob/master/a.bpmn'), null);
    });
});

describe('GitLabUrlParser.buildMrApiUrl', () => {
    it('builds the /api/v4 MR url with the group%2Fname project path', () => {
        const { parser } = createParser();
        const projectInfo = { url: 'https://gitlab.example.com/group/proj', name: 'proj' };
        assert.equal(
            parser.buildMrApiUrl(projectInfo, '5'),
            'https://gitlab.example.com/api/v4/projects/group%2Fproj/merge_requests/5'
        );
    });
});

describe('GitLabUrlParser.isMrDiffPage', () => {
    it('is true for an MR diffs url', () => {
        const { parser } = createParser();
        assert.equal(parser.isMrDiffPage('https://gitlab.example.com/g/p/-/merge_requests/5/diffs'), true);
    });

    it('is false for an MR overview url without /diffs', () => {
        const { parser } = createParser();
        assert.equal(parser.isMrDiffPage('https://gitlab.example.com/g/p/-/merge_requests/5'), false);
    });

    it('is false for a blob url', () => {
        const { parser } = createParser();
        assert.equal(parser.isMrDiffPage('https://gitlab.example.com/g/p/-/blob/master/a.bpmn'), false);
    });
});

describe('GitLabUrlParser.getBranchFileType', () => {
    it('detects a bpmn blob', () => {
        const { scope, parser } = createParser();
        assert.equal(parser.getBranchFileType('https://x/g/p/-/blob/master/a.bpmn'), scope.FILE_TYPE_BPMN);
    });

    it('detects a dmn blob', () => {
        const { scope, parser } = createParser();
        assert.equal(parser.getBranchFileType('https://x/g/p/-/blob/master/a.dmn'), scope.FILE_TYPE_DMN);
    });

    it('ignores query parameters when matching the extension', () => {
        const { scope, parser } = createParser();
        assert.equal(parser.getBranchFileType('https://x/g/p/-/blob/master/a.bpmn?plain=1'), scope.FILE_TYPE_BPMN);
    });

    it('returns null for a non-diagram blob', () => {
        const { parser } = createParser();
        assert.equal(parser.getBranchFileType('https://x/g/p/-/blob/master/readme.md'), null);
    });

    it('returns null when the url is not a blob url', () => {
        const { parser } = createParser();
        assert.equal(parser.getBranchFileType('https://x/g/p/-/merge_requests/5/diffs'), null);
    });
});

describe('GitLabUrlParser.extractBranchCommitIdAndFilePath', () => {
    it('extracts the ref and project-anchored file path (first regex)', () => {
        const { parser } = createParser();
        const res = parser.extractBranchCommitIdAndFilePath(
            'https://x/g/proj/-/blob/master/proj/process.bpmn', 'proj', null);
        assert.deepEqual({ ...res }, { branchCommitId: 'master', filePath: 'proj/process.bpmn' });
    });

    it('uses the DOM hint as the ref when the path is not project-anchored', () => {
        const { parser } = createParser();
        const res = parser.extractBranchCommitIdAndFilePath(
            'https://x/g/proj/-/blob/feature/x/dir/process.bpmn', 'proj', 'feature/x');
        assert.deepEqual({ ...res }, { branchCommitId: 'feature/x', filePath: 'dir/process.bpmn' });
    });

    it('falls back to the default ref alternation when no hint is given', () => {
        const { parser } = createParser();
        const res = parser.extractBranchCommitIdAndFilePath(
            'https://x/g/proj/-/blob/master/dir/process.bpmn', 'proj', null);
        assert.equal(res.branchCommitId, 'master');
        assert.equal(res.filePath, 'dir/process.bpmn');
    });

    it('strips query parameters from the file path', () => {
        const { parser } = createParser();
        const res = parser.extractBranchCommitIdAndFilePath(
            'https://x/g/proj/-/blob/master/proj/a.bpmn?plain=1', 'proj', null);
        assert.equal(res.filePath, 'proj/a.bpmn');
    });

    it('returns null when the url is not a blob url', () => {
        const { parser } = createParser();
        assert.equal(
            parser.extractBranchCommitIdAndFilePath('https://x/g/proj/-/merge_requests/5/diffs', 'proj', null),
            null
        );
    });
});
