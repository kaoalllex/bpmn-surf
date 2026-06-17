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

describe('GitLabRepoProviderBase.extractRenameMap', () => {
    const { GitLabRepoProviderBase } = createScope();

    it('maps new_path -> old_path for a renamed file', () => {
        const map = GitLabRepoProviderBase.extractRenameMap({
            changes: [{ old_path: 'a/old.bpmn', new_path: 'a/new.bpmn', renamed_file: true }]
        });
        assert.equal(map.get('a/new.bpmn'), 'a/old.bpmn');
        assert.equal(map.size, 1);
    });

    it('treats a path change without the renamed_file flag as a rename', () => {
        const map = GitLabRepoProviderBase.extractRenameMap({
            changes: [{ old_path: 'a/old.bpmn', new_path: 'a/new.bpmn' }]
        });
        assert.equal(map.get('a/new.bpmn'), 'a/old.bpmn');
    });

    it('ignores new, deleted and unchanged-path files', () => {
        const map = GitLabRepoProviderBase.extractRenameMap({
            changes: [
                { old_path: 'a/added.bpmn', new_path: 'a/added.bpmn', new_file: true },
                { old_path: 'a/gone.bpmn', new_path: 'a/gone.bpmn', deleted_file: true },
                { old_path: 'a/same.bpmn', new_path: 'a/same.bpmn' }
            ]
        });
        assert.equal(map.size, 0);
    });

    it('returns an empty map for a missing/empty changes response', () => {
        assert.equal(GitLabRepoProviderBase.extractRenameMap(null).size, 0);
        assert.equal(GitLabRepoProviderBase.extractRenameMap({}).size, 0);
        assert.equal(GitLabRepoProviderBase.extractRenameMap({ changes: [] }).size, 0);
    });
});

describe('GitLabRepoProviderBase.getTargetFilePath', () => {
    // Builds an initialized base provider whose loader returns the projects-search
    // payload for the project lookup and the given changes payload for the MR
    // `/changes` endpoint, recording every requested URL.
    async function createInitialized(changesPayload, { url = MR_URL } = {}) {
        const scope = createScope({ url });
        const calls = [];
        const load = async (requestedUrl) => {
            calls.push(requestedUrl);
            if (requestedUrl.includes('/changes')) {
                return JSON.stringify(changesPayload);
            }
            return JSON.stringify([{ id: 42, path_with_namespace: 'group/proj' }]);
        };
        const provider = new scope.GitLabRepoProviderBase(load);
        await provider.init();
        return { provider, calls };
    }

    it('returns the old path for a renamed file', async () => {
        const { provider } = await createInitialized({
            changes: [{ old_path: 'a/old.bpmn', new_path: 'a/new.bpmn', renamed_file: true }]
        });
        assert.equal(await provider.getTargetFilePath('a/new.bpmn'), 'a/old.bpmn');
    });

    it('returns filePath unchanged when the file was not renamed', async () => {
        const { provider } = await createInitialized({
            changes: [{ old_path: 'a/new.bpmn', new_path: 'a/new.bpmn' }]
        });
        assert.equal(await provider.getTargetFilePath('a/new.bpmn'), 'a/new.bpmn');
    });

    it('returns filePath without any request when there is no MR iid (branch view)', async () => {
        const { provider, calls } = await createInitialized(
            { changes: [] },
            { url: 'https://gitlab.example.com/group/proj/-/blob/master/proj/process.bpmn' }
        );
        const callsAfterInit = calls.length;
        assert.equal(await provider.getTargetFilePath('proj/process.bpmn'), 'proj/process.bpmn');
        assert.equal(calls.length, callsAfterInit); // no /changes request issued
    });

    it('falls back to filePath on a request/parse error', async () => {
        const scope = createScope({ url: MR_URL });
        const load = async (requestedUrl) => {
            if (requestedUrl.includes('/changes')) {
                throw new Error('boom');
            }
            return JSON.stringify([{ id: 42, path_with_namespace: 'group/proj' }]);
        };
        const provider = new scope.GitLabRepoProviderBase(load);
        await provider.init();
        assert.equal(await provider.getTargetFilePath('a/new.bpmn'), 'a/new.bpmn');
    });

    it('fetches the changes endpoint only once (cached per url)', async () => {
        const { provider, calls } = await createInitialized({
            changes: [{ old_path: 'a/old.bpmn', new_path: 'a/new.bpmn', renamed_file: true }]
        });
        await provider.getTargetFilePath('a/new.bpmn');
        await provider.getTargetFilePath('a/new.bpmn');
        const changesCalls = calls.filter(u => u.includes('/changes'));
        assert.equal(changesCalls.length, 1);
        assert.equal(
            changesCalls[0],
            'https://gitlab.example.com/api/v4/projects/42/merge_requests/5/changes'
        );
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
