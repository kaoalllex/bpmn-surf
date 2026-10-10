'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { createScope } = require('#scope');

const PLATFORM = { kind: 'github', projectUrl: 'https://github.com/acme/flows', hostUrl: 'https://github.com', projectId: 'acme/flows' };

function createClient(pages = {}, { searches = {}, platform = PLATFORM, change = {} } = {}) {
    const scope = createScope();
    if (!scope.window.crypto || !scope.window.crypto.subtle) {
        Object.defineProperty(scope.window, 'crypto', { value: webcrypto, configurable: true }); // jsdom lacks SubtleCrypto
    }
    const calls = [];
    const fetches = [];
    const load = async (url) => {
        calls.push(url);
        if (!(url in pages)) return url.includes('/repos/') ? JSON.stringify([]) : null;
        const page = pages[url];
        return page === null || typeof page === 'string' ? page : JSON.stringify(page);
    };
    const fetchFn = async (url, init) => {
        fetches.push({ url, init });
        const q = new URL(url).searchParams.get('q');
        const answer = searches[q];
        if (answer instanceof Error) throw answer;
        return answer || new Response('<html>rate limited</html>', { status: 429 });
    };
    return { client: new scope.GitHubPlatformClient(platform, load, { fetchFn, ...change }), calls, fetches };
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

// GitHub's search page answers JSON to `accept: application/json` (2026-10-10 spike).
function searchJson(results, extra = {}) {
    return new Response(JSON.stringify({ payload: { blackbirdSearchRoute: { logged_in: true, errors: [], results, ...extra } } }),
        { status: 200, headers: { 'content-type': 'application/json' } });
}

const PROCESS_HIT = {
    path: 'flows/payment.bpmn',
    snippets: [{
        lines: ['  &lt;<span class="pl-ent">bpmn:process</span> <span class="pl-e">id</span>=<span class="pl-s">&quot;<mark>Payment</mark>&quot;</span>&gt;',
            '    &lt;bpmn:startEvent id=&#34;Start&#34;&gt;'],
        starting_line_number: 3
    }]
};
const Q = (term) => `repo:acme/flows "${term.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

describe('GitHubPlatformClient.searchCode (web search, no token)', () => {
    it('asks the search page for JSON with the exact term quoted and normalises each snippet', async () => {
        const term = 'process id="Payment"';
        const { client, fetches } = createClient({}, { searches: { [Q(term)]: searchJson([PROCESS_HIT]) } });
        const hits = await client.searchCode('h'.repeat(40), term);
        assert.equal(fetches.length, 1);
        assert.equal(new URL(fetches[0].url).origin + new URL(fetches[0].url).pathname, 'https://github.com/search');
        assert.equal(new URL(fetches[0].url).searchParams.get('type'), 'code');
        assert.equal(fetches[0].init.headers.accept, 'application/json');
        assert.deepEqual(JSON.parse(JSON.stringify(hits)), [{
            path: 'flows/payment.bpmn',
            line: 3,
            snippet: '  <bpmn:process id="Payment">\n    <bpmn:startEvent id="Start">'
        }]);
    });

    it('yields one hit per snippet', async () => {
        const two = { ...PROCESS_HIT, snippets: [PROCESS_HIT.snippets[0], { lines: ['x'], starting_line_number: 9 }] };
        const { client } = createClient({}, { searches: { [Q('Payment')]: searchJson([two]) } });
        assert.deepEqual(Array.from(await client.searchCode('r', 'Payment'), h => h.line), [3, 9]);
    });

    for (const [name, answer] of [
        ['a 429', new Response('<html></html>', { status: 429 })],
        ['a non-JSON page', new Response('<html></html>', { status: 200 })],
        ['a network error', new Error('offline')],
        ['a signed-out answer', searchJson([PROCESS_HIT], { logged_in: false })],
        ['a repository still being indexed', searchJson([], { errors: [{ type: 'ERROR_TYPE_MISSING_INACCESSIBLE_REPO_ORG' }] })]
    ]) {
        it(`resolves to no hits — never rejects — on ${name}`, async () => {
            const { client } = createClient({}, { searches: { [Q('Payment')]: answer } });
            assert.deepEqual(JSON.parse(JSON.stringify(await client.searchCode('r', 'Payment'))), []);
        });
    }

    it('uses the page host on GitHub Enterprise Server', async () => {
        const ghes = { kind: 'github', projectUrl: 'https://ghe.example.com/acme/flows', hostUrl: 'https://ghe.example.com', projectId: 'acme/flows' };
        const { client, fetches } = createClient({}, { platform: ghes, searches: { [Q('Payment')]: searchJson([]) } });
        await client.searchCode('r', 'Payment');
        assert.ok(fetches[0].url.startsWith('https://ghe.example.com/search?'));
        assert.ok(client.searchPageUrl('Payment', 'r').startsWith('https://ghe.example.com/search?'));
    });

    it('lists an anonymous PR through the GHES REST base', async () => {
        const ghes = { kind: 'github', projectUrl: 'https://ghe.example.com/acme/flows', hostUrl: 'https://ghe.example.com', projectId: 'acme/flows' };
        const { client, calls } = createClient({}, { platform: ghes });
        await client.prChangedFiles(7);
        assert.ok(calls.includes('https://ghe.example.com/api/v3/repos/acme/flows/pulls/7/files?per_page=100&page=1'));
    });
});

describe('GitHubPlatformClient.searchCode — the PR\'s own files', () => {
    const HEAD = 'h'.repeat(40);
    const raw = (path) => `https://github.com/acme/flows/raw/${HEAD}/${path.split('/').map(encodeURIComponent).join('/')}`;
    const prPage = changesPage(7, [
        { path: 'handlers/AuditOrderHandler.kt', changeType: 'ADDED' },
        { path: 'flows/payment.bpmn', changeType: 'MODIFIED' },
        { path: 'flows/old.bpmn', changeType: 'DELETED' },
        { path: 'img/logo.png', changeType: 'ADDED' }
    ]);
    const pages = {
        [CHANGES_URL]: prPage,
        [raw('handlers/AuditOrderHandler.kt')]: 'package x\n\n@ExternalTaskSubscription("audit-order")\nclass AuditOrderHandler\n',
        [raw('flows/payment.bpmn')]: '<a>\n<bpmn:process id="Payment">\n</a>'
    };
    const change = { changeId: 7, headRef: HEAD };

    it('finds what the PR adds, which the default-branch index cannot know', async () => {
        const { client } = createClient(pages, { change, searches: { [Q('audit-order')]: searchJson([]) } });
        const hits = await client.searchCode(HEAD, 'audit-order');
        assert.deepEqual(JSON.parse(JSON.stringify(hits)), [{
            path: 'handlers/AuditOrderHandler.kt',
            line: 1,
            snippet: 'package x\n\n@ExternalTaskSubscription("audit-order")\nclass AuditOrderHandler\n'
        }]);
    });

    it('drops web hits on files the PR changed or deleted — the PR side wins', async () => {
        const web = searchJson([PROCESS_HIT, { path: 'flows/old.bpmn', snippets: [{ lines: ['Payment'], starting_line_number: 1 }] },
            { path: 'flows/other.bpmn', snippets: [{ lines: ['Payment'], starting_line_number: 5 }] }]);
        const { client } = createClient(pages, { change, searches: { [Q('Payment')]: web } });
        const hits = await client.searchCode(HEAD, 'Payment');
        assert.deepEqual(Array.from(hits, h => `${h.path}:${h.line}`), ['flows/payment.bpmn:1', 'flows/other.bpmn:5']);
    });

    it('keeps the PR side when the web search has no answer (anonymous, 429)', async () => {
        const { client } = createClient(pages, { change });  // no searches → 429
        assert.deepEqual(Array.from(await client.searchCode(HEAD, 'audit-order'), h => h.path), ['handlers/AuditOrderHandler.kt']);
    });

    it('reads the PR files once per differ, skips deleted and binary files', async () => {
        const { client, calls } = createClient(pages, { change, searches: { [Q('a')]: searchJson([]), [Q('b')]: searchJson([]) } });
        await client.searchCode(HEAD, 'a');
        await client.searchCode(HEAD, 'b');
        const rawCalls = calls.filter(u => u.includes('/raw/'));
        assert.deepEqual(rawCalls.sort(), [raw('flows/payment.bpmn'), raw('handlers/AuditOrderHandler.kt')].sort());
    });

    it('searches the web only for another ref, outside a PR, and on a PR too large to read', async () => {
        const many = changesPage(7, Array.from({ length: 101 }, (_, i) => ({ path: `f${i}.txt`, changeType: 'MODIFIED' })));
        for (const [setup, ref] of [[{ change }, 'b'.repeat(40)], [{}, HEAD], [{ change, pages: { [CHANGES_URL]: many } }, HEAD]]) {
            const { client, calls } = createClient(setup.pages || pages, { change: setup.change, searches: { [Q('x')]: searchJson([]) } });
            assert.deepEqual(Array.from(await client.searchCode(ref, 'x')), []);
            assert.equal(calls.filter(u => u.includes('/raw/')).length, 0);
        }
    });
});
