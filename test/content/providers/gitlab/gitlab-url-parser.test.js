'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

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

describe('GitLabUrlParser.extractCommitId', () => {
    const SHA = '90a2e87c4163d33e56c6a5741eb467161efb54f7';

    it('extracts commit_id from an MR diffs url', () => {
        const { parser } = createParser();
        assert.equal(
            parser.extractCommitId(`https://gitlab.example.com/g/p/-/merge_requests/5/diffs?commit_id=${SHA}`),
            SHA);
    });

    it('extracts commit_id when it is not the first query param', () => {
        const { parser } = createParser();
        assert.equal(
            parser.extractCommitId(`https://gitlab.example.com/g/p/-/merge_requests/5/diffs?view=inline&commit_id=${SHA}`),
            SHA);
    });

    it('extracts commit_id ignoring a trailing hash', () => {
        const { parser } = createParser();
        assert.equal(
            parser.extractCommitId(`https://gitlab.example.com/g/p/-/merge_requests/5/diffs?commit_id=${SHA}#note_1`),
            SHA);
    });

    it('returns null for the whole-MR view (no commit_id)', () => {
        const { parser } = createParser();
        assert.equal(parser.extractCommitId('https://gitlab.example.com/g/p/-/merge_requests/5/diffs'), null);
    });

    it('returns null when there is no query string', () => {
        const { parser } = createParser();
        assert.equal(parser.extractCommitId('https://gitlab.example.com/g/p/-/merge_requests/5/diffs#note_1'), null);
    });

    it('does not match a different param ending in commit_id', () => {
        const { parser } = createParser();
        assert.equal(
            parser.extractCommitId(`https://gitlab.example.com/g/p/-/merge_requests/5/diffs?start_commit_id=${SHA}`),
            null);
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
    it('splits a root-level file at the single slash', () => {
        const { parser } = createParser();
        const res = parser.extractBranchCommitIdAndFilePath(
            'https://x/g/proj/-/blob/master/process.bpmn', null);
        assert.deepEqual({ ...res }, { branchCommitId: 'master', filePath: 'process.bpmn' });
    });

    it('keeps the whole directory path when the file is nested (BUG-0034)', () => {
        const { parser } = createParser();
        const res = parser.extractBranchCommitIdAndFilePath(
            'https://x/g/proj/-/blob/main/order-service/src/main/resources/bpmn/order/OrderMain.bpmn', null);
        assert.deepEqual({ ...res }, {
            branchCommitId: 'main',
            filePath: 'order-service/src/main/resources/bpmn/order/OrderMain.bpmn'
        });
    });

    it('resolves a branch whose name is not in any hardcoded list', () => {
        const { parser } = createParser();
        const res = parser.extractBranchCommitIdAndFilePath(
            'https://x/g/proj/-/blob/renovate-bot/dir/sub/a.bpmn', null);
        assert.equal(res.branchCommitId, 'renovate-bot');
        assert.equal(res.filePath, 'dir/sub/a.bpmn');
    });

    it('uses the page ref selector for a slashed ref', () => {
        const { parser } = createParser();
        const res = parser.extractBranchCommitIdAndFilePath(
            'https://x/g/proj/-/blob/release/1.2/dir/process.bpmn', 'release/1.2');
        assert.deepEqual({ ...res }, { branchCommitId: 'release/1.2', filePath: 'dir/process.bpmn' });
    });

    it('ignores a hint that does not prefix the url tail', () => {
        const { parser } = createParser();
        const res = parser.extractBranchCommitIdAndFilePath(
            'https://x/g/proj/-/blob/main/dir/process.bpmn', 'some-other-branch');
        assert.equal(res.branchCommitId, 'main');
        assert.equal(res.filePath, 'dir/process.bpmn');
    });

    it('matches the commit SHA exactly without swallowing a deep path', () => {
        const { parser } = createParser();
        const sha = '0123456789abcdef0123456789abcdef01234567';
        const res = parser.extractBranchCommitIdAndFilePath(
            `https://x/g/proj/-/blob/${sha}/business/module-a/src/main/resources/bpmn/dir/a.bpmn`, null);
        assert.equal(res.branchCommitId, sha);
        assert.equal(res.filePath, 'business/module-a/src/main/resources/bpmn/dir/a.bpmn');
    });

    it('strips query parameters and the fragment from the file path', () => {
        const { parser } = createParser();
        const res = parser.extractBranchCommitIdAndFilePath(
            'https://x/g/proj/-/blob/master/dir/a.bpmn?ref_type=heads#L10', null);
        assert.equal(res.filePath, 'dir/a.bpmn');
    });

    it('returns null when the url is not a blob url', () => {
        const { parser } = createParser();
        assert.equal(
            parser.extractBranchCommitIdAndFilePath('https://x/g/proj/-/merge_requests/5/diffs', null),
            null
        );
    });

    it('returns null when the blob url carries no file path', () => {
        const { parser } = createParser();
        assert.equal(parser.extractBranchCommitIdAndFilePath('https://x/g/proj/-/blob/main', null), null);
    });
});
