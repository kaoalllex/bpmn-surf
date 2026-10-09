'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const REFS = { headSha: 'h'.repeat(40), mergeBaseSha: 'm'.repeat(40), headRef: 'feature/order', baseRef: 'main', title: 'Add order flow' };
const PR_URL = 'https://github.com/acme/flows/pull/42/changes';

function createProvider(url, { refs = REFS, blocks = [], blobRef = null } = {}) {
    const scope = createScope({ url });
    const calls = [];
    const load = async (requestUrl) => { calls.push(requestUrl); return null; };
    const scraper = { pullRefs: () => refs, fileBlocks: () => blocks, findBlobRef: () => blobRef };
    return { scope, calls, provider: new scope.GitHubRepoProvider(load, scraper) };
}

describe('GitHubRepoProvider (page)', () => {
    it('is available only for the github kind', () => {
        const { provider, scope } = createProvider(PR_URL);
        assert.equal(provider.isAvailable(scope.PLATFORM_KIND.GITHUB), true);
        assert.equal(provider.isAvailable(scope.PLATFORM_KIND.GITLAB), false);
    });

    it('resolves the PR from the page and makes no request', async () => {
        const { provider, calls } = createProvider(PR_URL);
        assert.equal(await provider.init(), true);
        await provider.initChangeInfo();
        assert.equal(await provider.getSourceCommitId(), REFS.headSha);
        assert.equal(await provider.getTargetCommitId(), REFS.mergeBaseSha);
        assert.deepEqual({ ...provider.getDiffSideLabels() }, { sourceLabel: 'feature/order', targetLabel: 'main' });
        assert.equal(provider.getChangeInfo().iid, 42);
        assert.equal(provider.getChangeInfo().title, 'Add order flow');
        assert.deepEqual(calls, []);
    });

    it('labels by short SHA when the page shows no branch names', async () => {
        const { provider, scope } = createProvider(PR_URL, { refs: { ...REFS, headRef: null, baseRef: null } });
        await provider.init();
        assert.deepEqual({ ...provider.getDiffSideLabels() },
            { sourceLabel: scope.shortenCommitId(REFS.headSha), targetLabel: scope.shortenCommitId(REFS.mergeBaseSha) });
    });

    it('fails init — never resolves to null refs — while the page has no refs', async () => {
        const { provider } = createProvider(PR_URL, { refs: null });
        assert.equal(await provider.init(), false);
    });

    // Conversation → Files changed by click keeps the Conversation payload in the
    // DOM; the page fetched again carries the current one.
    it('re-fetches the page once when the embedded payload is stale', async () => {
        const scope = createScope({ url: PR_URL });
        const calls = [];
        const load = async (url) => { calls.push(url); return '<html><body>fresh</body></html>'; };
        const scraper = {
            pullRefs: (doc) => (doc.body.textContent === 'fresh' ? REFS : null),
            fileBlocks: () => [],
            findBlobRef: () => null
        };
        const provider = new scope.GitHubRepoProvider(load, scraper);
        assert.equal(await provider.init(), true);
        assert.equal(await provider.getSourceCommitId(), REFS.headSha);
        await provider.init();
        assert.deepEqual(calls, [PR_URL]);
    });

    it('describes the repository as the project', async () => {
        const { provider } = createProvider(PR_URL);
        await provider.init();
        const info = provider.getProjectInfo();
        assert.deepEqual([info.url, info.hostUrl, info.groupName, info.name, info.id],
            ['https://github.com/acme/flows', 'https://github.com', 'acme', 'flows', 'acme/flows']);
    });

    it('resolves a renamed file to its previous path from the rendered block', async () => {
        const { provider } = createProvider(PR_URL, { blocks: [{ path: 'b/new.bpmn', oldPath: 'a/old.bpmn' }] });
        await provider.init();
        assert.equal(await provider.getTargetFilePath('b/new.bpmn'), 'a/old.bpmn');
        assert.equal(await provider.getTargetFilePath('c/same.bpmn'), 'c/same.bpmn');
    });

    it('stays silent off PR and blob pages', async () => {
        for (const url of ['https://github.com/acme/flows', 'https://github.com/acme/flows/pull/42',
            'https://github.com/acme/flows/pull/42/commits/abc', 'https://github.com/acme/flows/issues/1']) {
            const { provider } = createProvider(url);
            assert.equal(await provider.init(), false, url);
        }
    });
});

describe('GitHubRepoProvider (page) — blob view', () => {
    const BLOB_URL = 'https://github.com/acme/flows/blob/feature/x/My%20Flows/order.bpmn';

    it('initialises without network and splits a slashed ref using the page', async () => {
        const { provider, calls, scope } = createProvider(BLOB_URL, { blobRef: 'feature/x' });
        assert.equal(await provider.init(), true);
        assert.equal(await provider.isChangeViewActive(), false);
        assert.equal(await provider.getBranchFileType(), scope.FILE_TYPE_BPMN);
        assert.deepEqual({ ...(await provider.extractBranchCommitIdAndFilePath()) },
            { branchCommitId: 'feature/x', filePath: 'My Flows/order.bpmn' });
        assert.deepEqual(calls, []);
    });

    it('returns null until the page shows its ref', async () => {
        const { provider } = createProvider(BLOB_URL, { blobRef: null });
        await provider.init();
        assert.equal(await provider.extractBranchCommitIdAndFilePath(), null);
    });
});
