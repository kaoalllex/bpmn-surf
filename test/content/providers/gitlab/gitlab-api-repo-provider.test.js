'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

// MR API responses, trimmed to the fields the provider maps. Shapes mirror real
// GET /api/v4/projects/{id}/merge_requests/{iid} responses (verified on
// gitlab.com): diff_refs.head_sha/base_sha exist identically for opened and
// merged MRs.
const OPENED_MR = {
    iid: 2,
    state: 'opened',
    title: 'Opened MR title',
    source_branch: 'feature/b2',
    target_branch: 'main',
    diff_refs: {
        base_sha: '2696834923e7f1088a043fbf9229fd35ac3a31df',
        head_sha: '90a2e87c4163d33e56c6a5741eb467161efb54f7',
        start_sha: '2696834923e7f1088a043fbf9229fd35ac3a31df'
    }
};

const MERGED_MR = {
    iid: 1,
    state: 'merged',
    title: 'Merged MR title',
    source_branch: 'feature/b1',
    target_branch: 'main',
    merge_commit_sha: '2696834923e7f1088a043fbf9229fd35ac3a31df',
    diff_refs: {
        base_sha: 'a4de8124a957e31f72e55d9bc856c00d6988a083',
        head_sha: '34c4db57af7d31f72ca22abfb1d462eb4a87dd2e',
        start_sha: 'a4de8124a957e31f72e55d9bc856c00d6988a083'
    }
};

const HOST_URL = 'https://gitlab.example.com';
const PROJECT_ID = 42;

// Builds a provider whose content loader returns `mr` as JSON and records the
// URLs it was asked for, on an MR diffs page for the given iid.
function createProvider(mr, iid = 2) {
    const scope = createScope({ url: `${HOST_URL}/group/proj/-/merge_requests/${iid}/diffs` });
    const calls = [];
    const load = async (url) => {
        calls.push(url);
        return JSON.stringify(mr);
    };
    const provider = new scope.GitLabApiRepoProvider(load);
    const projectInfo = provider.getProjectInfo();
    projectInfo.id = PROJECT_ID;
    projectInfo.hostUrl = HOST_URL;
    projectInfo.url = `${HOST_URL}/group/proj`;
    return { scope, provider, calls };
}

describe('GitLabApiRepoProvider — source/target commit mapping', () => {
    it('maps diff_refs.head_sha to the source commit id (opened)', async () => {
        const { provider } = createProvider(OPENED_MR);
        assert.equal(await provider.getSourceCommitId(), OPENED_MR.diff_refs.head_sha);
    });

    it('maps diff_refs.base_sha to the target commit id (opened)', async () => {
        const { provider } = createProvider(OPENED_MR);
        assert.equal(await provider.getTargetCommitId(), OPENED_MR.diff_refs.base_sha);
    });

    it('maps the same diff_refs fields for a merged MR', async () => {
        const { provider } = createProvider(MERGED_MR, 1);
        assert.equal(await provider.getSourceCommitId(), MERGED_MR.diff_refs.head_sha);
        assert.equal(await provider.getTargetCommitId(), MERGED_MR.diff_refs.base_sha);
    });

    it('ignores the legacy heuristic arguments of getTargetCommitId', async () => {
        const { provider } = createProvider(OPENED_MR);
        const fromApi = await provider.getTargetCommitId('source-sha', 'some title', 'main');
        assert.equal(fromApi, OPENED_MR.diff_refs.base_sha);
    });
});

describe('GitLabApiRepoProvider — branch names and change info', () => {
    it('maps source_branch/target_branch to branch names', async () => {
        const { provider } = createProvider(OPENED_MR);
        await provider.initChangeInfo();
        const names = provider.getChangeBranchNames();
        assert.equal(names.sourceBranchName, OPENED_MR.source_branch);
        assert.equal(names.targetBranchName, OPENED_MR.target_branch);
    });

    it('returns null branch names before the MR info is loaded', () => {
        const { provider } = createProvider(OPENED_MR);
        assert.equal(provider.getChangeBranchNames(), null);
    });

    it('populates change info (iid + title) from the API response', async () => {
        const { provider } = createProvider(OPENED_MR);
        await provider.initChangeInfo();
        const info = provider.getChangeInfo();
        assert.equal(info.iid, '2');
        assert.equal(info.title, OPENED_MR.title);
    });
});

describe('GitLabApiRepoProvider — request building and caching', () => {
    it('builds the MR API URL from numeric project id and iid', async () => {
        const { provider, calls } = createProvider(OPENED_MR);
        await provider.getSourceCommitId();
        assert.equal(calls[0], `${HOST_URL}/api/v4/projects/${PROJECT_ID}/merge_requests/2`);
    });

    it('loads the MR only once across several getters', async () => {
        const { provider, calls } = createProvider(OPENED_MR);
        await provider.initChangeInfo();
        await provider.getSourceCommitId();
        await provider.getTargetCommitId();
        assert.equal(calls.length, 1);
    });
});

describe('GitLabApiRepoProvider — missing diff_refs', () => {
    it('returns null commit ids when diff_refs is absent', async () => {
        const mrWithoutRefs = { iid: 2, title: 't', source_branch: 's', target_branch: 'main' };
        const { provider } = createProvider(mrWithoutRefs);
        assert.equal(await provider.getSourceCommitId(), null);
        assert.equal(await provider.getTargetCommitId(), null);
    });
});
