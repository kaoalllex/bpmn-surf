'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const MR_URL = 'https://gitlab.example.com/group/proj/-/merge_requests/5/diffs';

// Builds a base provider on an MR page whose injected loader returns the given
// projects-search payload and records the URLs it was asked for.
function createBase(projectsPayload, { url = MR_URL } = {}) {
    const scope = createScope({ url });
    const calls = [];
    const load = async (requestedUrl) => {
        calls.push(requestedUrl);
        return JSON.stringify(projectsPayload);
    };
    const provider = new scope.GitLabRepoProviderBase(load);
    return { scope, provider, calls };
}

describe('GitLabRepoProviderBase.isAvailable', () => {
    it('is true on a gitlab url', () => {
        const { provider } = createBase([]);
        assert.equal(provider.isAvailable(), true);
    });
});

describe('GitLabRepoProviderBase.init — project id resolution', () => {
    it('resolves project info and id from the projects search', async () => {
        const { provider } = createBase([
            { id: 7, path_with_namespace: 'other/proj' },
            { id: 42, path_with_namespace: 'group/proj' }
        ]);
        assert.equal(await provider.init(), true);
        const info = provider.getProjectInfo();
        assert.equal(info.url, 'https://gitlab.example.com/group/proj');
        assert.equal(info.hostUrl, 'https://gitlab.example.com');
        assert.equal(info.groupName, 'group');
        assert.equal(info.name, 'proj');
        assert.equal(info.id, 42);
    });

    it('queries the projects API by host url and project name', async () => {
        const { provider, calls } = createBase([{ id: 42, path_with_namespace: 'group/proj' }]);
        await provider.init();
        assert.equal(
            calls[0],
            'https://gitlab.example.com/api/v4/projects/?simple=true&per_page=100&search=proj'
        );
    });

    it('returns false when the project is not found by path_with_namespace', async () => {
        const { provider } = createBase([{ id: 7, path_with_namespace: 'group/other' }]);
        assert.equal(await provider.init(), false);
    });

    it('returns false on a url without the /-/ marker', async () => {
        const { provider } = createBase([], { url: 'https://gitlab.example.com/group/proj' });
        assert.equal(await provider.init(), false);
    });

    it('caches the init result for the same url (single API call)', async () => {
        const { provider, calls } = createBase([{ id: 42, path_with_namespace: 'group/proj' }]);
        await provider.init();
        await provider.init();
        assert.equal(calls.length, 1);
    });
});

describe('GitLabRepoProviderBase.getChangeInfo', () => {
    it('returns the (initially empty) merge request info object', () => {
        const { provider } = createBase([]);
        const info = provider.getChangeInfo();
        assert.equal(info.iid, null);
        assert.equal(info.title, null);
    });
});

describe('GitLabRepoProviderBase.extractBranchCommitIdAndFilePath', () => {
    it('extracts ref and file path from a blob url', async () => {
        const { provider } = createBase(
            [{ id: 42, path_with_namespace: 'group/proj' }],
            { url: 'https://gitlab.example.com/group/proj/-/blob/master/proj/process.bpmn' }
        );
        await provider.init();
        const res = provider.extractBranchCommitIdAndFilePath();
        assert.equal(res.branchCommitId, 'master');
        assert.equal(res.filePath, 'proj/process.bpmn');
    });
});
