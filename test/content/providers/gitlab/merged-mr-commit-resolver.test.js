'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

// All collaborators are injected, so these tests need neither fetch nor
// localStorage: the merged badge, the master-commit history and the atom feed
// loader are stubbed directly.
const MR_INFO_URL = 'https://x/api/v4/projects/g%2Fp/merge_requests/5';

function buildResolver({ merged = false, mrJson = null, previousById = {}, atomFeed = null } = {}) {
    const scope = createScope();
    const calls = [];

    const domScraper = { isMergedByBadge: () => merged };
    const masterCommitManager = {
        findPreviousCommitId: async (commitId) => previousById[commitId] ?? null
    };
    const loadContent = async (url, throwIf404) => {
        calls.push({ url, throwIf404 });
        if (url === MR_INFO_URL) {
            return mrJson === null ? null : JSON.stringify(mrJson);
        }
        return atomFeed;
    };
    const projectInfo = { url: 'https://x/g/p' };

    const resolver = new scope.MergedMrCommitResolver(projectInfo, domScraper, masterCommitManager, loadContent);
    return { resolver, calls, scope };
}

// Atom feed shaped like GitLab's /-/commits/master?format=atom search results.
function atomFeed(entries) {
    const items = entries.map(e =>
        `<entry><id>https://x/g/p/-/commit/${e.id}</id><title>${e.title}</title></entry>`
    ).join('');
    return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${items}</feed>`;
}

describe('MergedMrCommitResolver — opened MR', () => {
    it('returns the target branch name when the MR is not merged', async () => {
        const { resolver } = buildResolver({ merged: false, mrJson: { state: 'opened' } });
        const res = await resolver.resolveTargetCommitId('src-sha', 'title', 'main', MR_INFO_URL);
        assert.equal(res, 'main');
    });

    it('does not consult the master-commit history for an opened MR', async () => {
        const scope = createScope();
        let consulted = false;
        const domScraper = { isMergedByBadge: () => false };
        const masterCommitManager = {
            findPreviousCommitId: async () => { consulted = true; return null; }
        };
        const loadContent = async () => JSON.stringify({ state: 'opened' });
        const resolver = new scope.MergedMrCommitResolver(
            { url: 'https://x/g/p' }, domScraper, masterCommitManager, loadContent);

        const res = await resolver.resolveTargetCommitId('src-sha', 'title', 'develop', MR_INFO_URL);
        assert.equal(res, 'develop');
        assert.equal(consulted, false);
    });
});

describe('MergedMrCommitResolver — merged MR via badge', () => {
    it('returns the commit before the source commit when found in history', async () => {
        const { resolver } = buildResolver({
            merged: true,
            previousById: { 'src-sha': 'prev-of-src' }
        });
        const res = await resolver.resolveTargetCommitId('src-sha', 'title', 'main', MR_INFO_URL);
        assert.equal(res, 'prev-of-src');
    });

    it('falls back to locating the commit by title, then its predecessor', async () => {
        const { resolver } = buildResolver({
            merged: true,
            previousById: { 'commit-by-title': 'prev-of-title' }, // src-sha has no predecessor
            atomFeed: atomFeed([
                { id: 'unrelated', title: 'Other change' },
                { id: 'commit-by-title', title: 'My MR title here' }
            ])
        });
        const res = await resolver.resolveTargetCommitId('src-sha', 'My MR title', 'main', MR_INFO_URL);
        assert.equal(res, 'prev-of-title');
    });

    it('returns the target branch name when neither lookup yields a commit', async () => {
        const { resolver } = buildResolver({
            merged: true,
            previousById: {}, // no predecessors at all
            atomFeed: atomFeed([{ id: 'x', title: 'No match' }])
        });
        const res = await resolver.resolveTargetCommitId('src-sha', 'My MR title', 'main', MR_INFO_URL);
        assert.equal(res, 'main');
    });
});

describe('MergedMrCommitResolver — merged MR via API', () => {
    it('detects a merged MR from merged_at in the MR info', async () => {
        const { resolver } = buildResolver({
            merged: false,
            mrJson: { merged_at: '2026-01-01T00:00:00Z' },
            previousById: { 'src-sha': 'prev-of-src' }
        });
        const res = await resolver.resolveTargetCommitId('src-sha', 'title', 'main', MR_INFO_URL);
        assert.equal(res, 'prev-of-src');
    });

    it('detects a merged MR from state === "merged"', async () => {
        const { resolver } = buildResolver({
            merged: false,
            mrJson: { state: 'merged' },
            previousById: { 'src-sha': 'prev-of-src' }
        });
        const res = await resolver.resolveTargetCommitId('src-sha', 'title', 'main', MR_INFO_URL);
        assert.equal(res, 'prev-of-src');
    });

    it('treats a missing mrInfoUrl as not merged', async () => {
        const { resolver, calls } = buildResolver({ merged: false });
        const res = await resolver.resolveTargetCommitId('src-sha', 'title', 'main', null);
        assert.equal(res, 'main');
        assert.equal(calls.length, 0);
    });
});

describe('MergedMrCommitResolver — caching', () => {
    it('caches the resolved target commit id by source/title/branch', async () => {
        const { resolver, calls } = buildResolver({
            merged: false,
            mrJson: { state: 'merged' },
            previousById: { 'src-sha': 'prev-of-src' }
        });
        const first = await resolver.resolveTargetCommitId('src-sha', 'title', 'main', MR_INFO_URL);
        const callsAfterFirst = calls.length;
        const second = await resolver.resolveTargetCommitId('src-sha', 'title', 'main', MR_INFO_URL);
        assert.equal(first, 'prev-of-src');
        assert.equal(second, 'prev-of-src');
        assert.equal(calls.length, callsAfterFirst); // no extra loads on cache hit
    });
});
