'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const PULL = { number: 42, title: 'Add order flow', head: { sha: 'h'.repeat(40), ref: 'feature/order' }, base: { sha: 'b'.repeat(40), ref: 'main' } };
const COMPARE = {
    merge_base_commit: { sha: 'm'.repeat(40) },
    files: [{ filename: 'flows/new-name.bpmn', previous_filename: 'flows/old-name.bpmn', status: 'renamed' }]
};
const PR_URL = 'https://github.com/acme/flows/pull/42/files';
const RENDERED = [{ path: 'flows/new-name.bpmn', oldPath: null }];

function createProvider({ failWith, blocks = RENDERED, missing = false, url = PR_URL } = {}) {
    const scope = createScope({ url });
    const calls = [];
    const load = async (url) => {
        calls.push(url);
        if (failWith) {
            throw new Error(failWith);
        }
        if (missing) {
            return null;
        }
        return JSON.stringify(url.includes('/compare/') ? COMPARE : PULL);
    };
    const scraper = { pullRefs: () => null, fileBlocks: () => blocks, findBlobRef: () => null };
    return { calls, provider: new scope.GitHubApiRepoProvider(load, scraper) };
}

describe('GitHubApiRepoProvider (fallback)', () => {
    it('waits for a rendered PR page before spending quota', async () => {
        const { provider, calls } = createProvider({ blocks: [] });
        assert.equal(await provider.init(), false);
        assert.deepEqual(calls, []);
    });

    it('gives a commit or range selection no button and spends no quota', async () => {
        const { provider, calls } = createProvider({ url: `https://github.com/acme/flows/pull/42/files/${'a'.repeat(40)}..${'b'.repeat(40)}` });
        assert.equal(await provider.init(), false);
        assert.deepEqual(calls, []);
    });

    it('diffs the head against the merge base from compare', async () => {
        const { provider, calls } = createProvider();
        assert.equal(await provider.init(), true);
        assert.equal(await provider.getSourceCommitId(), PULL.head.sha);
        assert.equal(await provider.getTargetCommitId(), COMPARE.merge_base_commit.sha);
        assert.equal(await provider.getTargetFilePath('flows/new-name.bpmn'), 'flows/old-name.bpmn');
        assert.deepEqual(calls, [
            'https://api.github.com/repos/acme/flows/pulls/42',
            `https://api.github.com/repos/acme/flows/compare/${PULL.base.sha}...${PULL.head.sha}`
        ]);
    });

    it('fetches each PR once however often init runs', async () => {
        const { provider, calls } = createProvider();
        await provider.init(); await provider.init(); await provider.init();
        assert.equal(calls.length, 2);
    });

    it('fails init on a rate limit and does not refetch', async () => {
        const { provider, calls } = createProvider({ failWith: 'Error fetching x after 5 ms: unexpected status 403' });
        assert.equal(await provider.init(), false);
        assert.equal(await provider.init(), false);
        assert.equal(calls.length, 1);
    });

    it('treats a PR the anonymous API cannot see as unavailable', async () => {
        const { provider } = createProvider({ missing: true });
        assert.equal(await provider.init(), false);
    });
});
