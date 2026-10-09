'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { createScope } = require('#scope');

const PLATFORM = { kind: 'github', projectUrl: 'https://github.com/acme/flows', hostUrl: 'https://github.com', projectId: 'acme/flows' };

function createClient(pages = {}) {
    const scope = createScope();
    if (!scope.window.crypto || !scope.window.crypto.subtle) {
        Object.defineProperty(scope.window, 'crypto', { value: webcrypto, configurable: true }); // jsdom lacks SubtleCrypto
    }
    const calls = [];
    const load = async (url) => {
        calls.push(url);
        if (!(url in pages)) return url.includes('api.github.com') ? JSON.stringify([]) : null;
        const page = pages[url];
        return page === null || typeof page === 'string' ? page : JSON.stringify(page);
    };
    return { client: new scope.GitHubPlatformClient(PLATFORM, load), calls };
}

const filesUrl = (page) => `https://api.github.com/repos/acme/flows/pulls/7/files?per_page=100&page=${page}`;
const CHANGES_URL = 'https://github.com/acme/flows/pull/7/changes';

// The new "Files changed" page as served signed in (2026-10-09), reduced to the
// embedded payload the client reads.
function changesPage(number, summaries, contents = []) {
    const data = { payload: {
        pullRequestsChangesRoute: { diffSummaries: summaries, diffContents: contents },
        pullRequestsLayoutRoute: { pullRequest: { number } }
    } };
    return `<react-app app-name="repo"><script type="application/json" data-target="react-app.embeddedData">${JSON.stringify(data)}</script></react-app>`;
}

describe('GitHubPlatformClient URLs', () => {
    it('loads raw content same-origin through github.com, encoding each segment', () => {
        const { client } = createClient();
        assert.equal(client.rawFileUrl('feature/x', 'My Flows/a#1.bpmn'),
            'https://github.com/acme/flows/raw/feature/x/My%20Flows/a%231.bpmn');
    });

    it('builds the blob URL with an optional line anchor', () => {
        const { client } = createClient();
        assert.equal(client.blobFileUrl('abc123', 'dir/p.bpmn'), 'https://github.com/acme/flows/blob/abc123/dir/p.bpmn');
        assert.equal(client.blobFileUrl('abc123', 'dir/p.bpmn', 7), 'https://github.com/acme/flows/blob/abc123/dir/p.bpmn#L7');
    });

    it('scopes the code search page to the repository', () => {
        const { client } = createClient();
        const url = new URL(client.searchPageUrl('process id="Order"', 'abc123'));
        assert.equal(url.origin + url.pathname, 'https://github.com/search');
        assert.equal(url.searchParams.get('q'), 'repo:acme/flows process id="Order"');
        assert.equal(url.searchParams.get('type'), 'code');
    });

    it('anchors the PR file diff link with sha256 of the path, as GitHub does', async () => {
        const { client } = createClient();
        assert.equal(
            await client.prFileDiffUrl(104, 'spring-boot-starter/example-dmn-rest/src/main/resources/dmn/check-order.dmn'),
            'https://github.com/acme/flows/pull/104/files#diff-a5d61c3218eec1cb11759fdd1ab5463aa8d75110dff8ea9e4c64a0945f6e92e6');
    });
});

describe('GitHubPlatformClient.prChangedFiles — from the PR page', () => {
    it('lists every file of the payload without touching the API', async () => {
        const { client, calls } = createClient({ [CHANGES_URL]: changesPage(7, [
            { path: 'a/New.kt', changeType: 'ADDED' },
            { path: 'a/Gone.kt', changeType: 'DELETED' },
            { path: 'a/Edit.kt', changeType: 'MODIFIED' },
            { path: 'b/Moved.kt', changeType: 'RENAMED' }
        ], [{ oldTreeEntry: { path: 'a/Moved.kt' }, newTreeEntry: { path: 'b/Moved.kt' } }]) });
        assert.deepEqual(JSON.parse(JSON.stringify(await client.prChangedFiles(7))), [
            { path: 'a/New.kt', oldPath: null, status: 'added' },
            { path: 'a/Gone.kt', oldPath: null, status: 'removed' },
            { path: 'a/Edit.kt', oldPath: null, status: 'changed' },
            { path: 'b/Moved.kt', oldPath: 'a/Moved.kt', status: 'changed' }
        ]);
        assert.deepEqual(calls, [CHANGES_URL]);
    });

    it('ignores a payload of another pull request and falls back to the API', async () => {
        const { client, calls } = createClient({ [CHANGES_URL]: changesPage(8, [{ path: 'x.kt', changeType: 'MODIFIED' }]),
            [filesUrl(1)]: [{ filename: 'a/Edit.kt', status: 'modified' }] });
        assert.deepEqual(JSON.parse(JSON.stringify((await client.prChangedFiles(7)).map(f => f.path))), ['a/Edit.kt']);
        assert.deepEqual(calls, [CHANGES_URL, filesUrl(1)]);
    });
});

describe('GitHubPlatformClient.prChangedFiles — REST fallback (anonymous, classic page)', () => {
    it('normalises statuses and renames', async () => {
        const { client } = createClient({ [filesUrl(1)]: [
            { filename: 'a/New.kt', status: 'added' },
            { filename: 'a/Gone.kt', status: 'removed' },
            { filename: 'a/Edit.kt', status: 'modified' },
            { filename: 'b/Moved.kt', previous_filename: 'a/Moved.kt', status: 'renamed' }
        ] });
        assert.deepEqual(JSON.parse(JSON.stringify(await client.prChangedFiles(7))), [
            { path: 'a/New.kt', oldPath: null, status: 'added' },
            { path: 'a/Gone.kt', oldPath: null, status: 'removed' },
            { path: 'a/Edit.kt', oldPath: null, status: 'changed' },
            { path: 'b/Moved.kt', oldPath: 'a/Moved.kt', status: 'changed' }
        ]);
    });

    it('reads further pages only while they are full, at most three', async () => {
        const full = Array.from({ length: 100 }, (_, i) => ({ filename: `f${i}.kt`, status: 'modified' }));
        const { client, calls } = createClient({ [filesUrl(1)]: full, [filesUrl(2)]: full, [filesUrl(3)]: full, [filesUrl(4)]: full });
        assert.equal((await client.prChangedFiles(7)).length, 300);
        assert.deepEqual(calls, [CHANGES_URL, filesUrl(1), filesUrl(2), filesUrl(3)]);
    });

    it('rejects when neither the page nor the anonymous API has the PR', async () => {
        const { client } = createClient({ [filesUrl(1)]: null });
        await assert.rejects(client.prChangedFiles(7), /not visible to the anonymous GitHub API/);
        // (the page URL is absent from `pages`, so the helper returns null for it)
    });
});

describe('GitHubPlatformClient code search', () => {
    it('rejects, so navigators take their search-page fallback', async () => {
        const { client } = createClient();
        await assert.rejects(client.searchCode('abc', 'x'), /not supported on GitHub yet/);
    });
});
