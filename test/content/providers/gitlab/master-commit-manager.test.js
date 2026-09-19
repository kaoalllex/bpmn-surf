'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

// A GitLab origin gives jsdom a working localStorage; fetch is stubbed on the window.
function buildManager() {
    const scope = createScope({ url: 'https://x/g/p' });
    const urls = [];
    const feeds = {};
    scope.window.fetch = async (url) => {
        urls.push(url);
        const branch = decodeURIComponent(url.match(/\/-\/commits\/(.+)\?/)[1]);
        return { ok: true, text: async () => feeds[branch] ?? '<feed/>' };
    };
    const manager = new scope.MasterCommitManager({ id: 7, url: 'https://x/g/p' });
    return { manager, urls, feeds, scope };
}

function feed(ids) {
    const items = ids.map(id => `<entry><id>https://x/g/p/-/commit/${id}</id><title>t</title></entry>`).join('');
    return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${items}</feed>`;
}

describe('MasterCommitManager — target branch', () => {
    it('reads the commit history of the given branch', async () => {
        const { manager, urls, feeds } = buildManager();
        feeds.develop = feed(['c3', 'c2', 'c1']);

        const prev = await manager.findPreviousCommitId('c3', 'develop');

        assert.equal(prev, 'c2');
        assert.ok(urls[0].startsWith('https://x/g/p/-/commits/develop?format=atom'), urls[0]);
    });

    it('keeps the histories of different branches apart', async () => {
        const { manager, feeds, scope } = buildManager();
        feeds.main = feed(['m2', 'm1']);
        feeds.develop = feed(['d2', 'd1']);

        assert.equal(await manager.findPreviousCommitId('m2', 'main'), 'm1');
        assert.equal(await manager.findPreviousCommitId('d2', 'develop'), 'd1');

        // A fresh manager must not read develop's history from main's localStorage cache.
        const fresh = new scope.MasterCommitManager({ id: 7, url: 'https://x/g/p' });
        assert.equal(await fresh.findPreviousCommitId('d2', 'main'), null);
    });
});
