'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { GitLabPlatformClient } = createScope();

// Results are built inside the jsdom vm realm, so their prototypes differ from
// the host realm and deepStrictEqual would reject them — round-trip to plain
// host objects before comparing (see scope.js note on cross-realm values).
const plain = (value) => JSON.parse(JSON.stringify(value));

const PLATFORM = {
    projectUrl: 'https://gitlab.example/group/proj',
    hostUrl: 'https://gitlab.example',
    projectId: 42
};

// Builds a client whose content loader returns `payload` (verbatim or stringified)
// and records every URL it was asked for.
function withLoader(payload) {
    const calls = [];
    const load = async (url) => {
        calls.push(url);
        return typeof payload === 'string' || payload === null ? payload : JSON.stringify(payload);
    };
    return { client: new GitLabPlatformClient(PLATFORM, load), calls };
}

describe('GitLabPlatformClient URL builders', () => {
    const client = new GitLabPlatformClient(PLATFORM);

    it('builds a raw file URL at a ref', () => {
        assert.equal(
            client.rawFileUrl('abc123', 'src/process.bpmn'),
            'https://gitlab.example/group/proj/-/raw/abc123/src/process.bpmn'
        );
    });

    it('builds a blob file URL anchored to a line', () => {
        assert.equal(
            client.blobFileUrl('abc123', 'src/A.kt', 18),
            'https://gitlab.example/group/proj/-/blob/abc123/src/A.kt#L18'
        );
    });

    it('omits the line anchor when no line is given', () => {
        assert.equal(
            client.blobFileUrl('abc123', 'src/A.kt'),
            'https://gitlab.example/group/proj/-/blob/abc123/src/A.kt'
        );
    });

    it('builds a code-search page URL at /search with a project_id (BUG-0038)', () => {
        // <project>/-/search 404s; the project-scoped page is <host>/search.
        assert.equal(
            client.searchPageUrl('calledElement="Some Process"', 'feature/x'),
            'https://gitlab.example/search' +
            '?search=calledElement%3D%22Some+Process%22&project_id=42&scope=blobs' +
            '&repository_ref=feature%2Fx'
        );
    });

    it('omits the ref from the search page URL when there is none', () => {
        const url = client.searchPageUrl('topicName', null);
        assert.ok(!url.includes('repository_ref'), url);
        assert.ok(url.startsWith('https://gitlab.example/search?search=topicName'), url);
    });

    it('builds the MR diffs URL', () => {
        assert.equal(
            client.prDiffsUrl(7),
            'https://gitlab.example/group/proj/-/merge_requests/7/diffs'
        );
    });
});

describe('GitLabPlatformClient.searchCode', () => {
    it('queries the blobs search API at the ref and term', async () => {
        const { client, calls } = withLoader([]);
        await client.searchCode('main', 'process id="Foo"');
        assert.equal(
            calls[0],
            'https://gitlab.example/api/v4/projects/42/search' +
            '?scope=blobs&ref=main&search=process%20id%3D%22Foo%22'
        );
    });

    it('appends per_page when requested (large correlation page)', async () => {
        const { client, calls } = withLoader([]);
        await client.searchCode('main', 'Order', { perPage: 100 });
        assert.match(calls[0], /&per_page=100$/);
    });

    it('normalises GitLab items (path/startline/data) to { path, line, snippet }', async () => {
        const { client } = withLoader([
            { path: 'src/A.kt', startline: 23, data: 'correlateMessage("X")' },
            { path: 'src/B.kt', startline: 5, data: 'class B' }
        ]);
        const hits = plain(await client.searchCode('main', 'X'));
        assert.deepEqual(hits, [
            { path: 'src/A.kt', line: 23, snippet: 'correlateMessage("X")' },
            { path: 'src/B.kt', line: 5, snippet: 'class B' }
        ]);
    });

    it('returns [] when the loader yields nothing', async () => {
        const { client } = withLoader(null);
        assert.deepEqual(plain(await client.searchCode('main', 'X')), []);
    });
});

describe('GitLabPlatformClient.prChangedFiles', () => {
    it('classifies an added file (new_file) from new_path', async () => {
        const { client } = withLoader({ changes: [
            { old_path: 'src/New.kt', new_path: 'src/New.kt', new_file: true }
        ] });
        assert.deepEqual(plain(await client.prChangedFiles(2)), [
            { path: 'src/New.kt', oldPath: 'src/New.kt', status: 'added' }
        ]);
    });

    it('classifies a deleted file (deleted_file) from old_path', async () => {
        const { client } = withLoader({ changes: [
            { old_path: 'src/Gone.kt', new_path: 'src/Gone.kt', deleted_file: true }
        ] });
        assert.deepEqual(plain(await client.prChangedFiles(2)), [
            { path: 'src/Gone.kt', oldPath: 'src/Gone.kt', status: 'removed' }
        ]);
    });

    it('classifies a renamed file as changed, keeping new and old paths', async () => {
        const { client } = withLoader({ changes: [
            { old_path: 'src/Old.kt', new_path: 'src/New.kt', renamed_file: true }
        ] });
        assert.deepEqual(plain(await client.prChangedFiles(2)), [
            { path: 'src/New.kt', oldPath: 'src/Old.kt', status: 'changed' }
        ]);
    });

    it('classifies a modified file as changed', async () => {
        const { client } = withLoader({ changes: [
            { old_path: 'src/Mod.kt', new_path: 'src/Mod.kt' }
        ] });
        assert.deepEqual(plain(await client.prChangedFiles(2)), [
            { path: 'src/Mod.kt', oldPath: 'src/Mod.kt', status: 'changed' }
        ]);
    });

    it('queries the MR changes API for the change id', async () => {
        const { client, calls } = withLoader({ changes: [] });
        await client.prChangedFiles(99);
        assert.equal(
            calls[0],
            'https://gitlab.example/api/v4/projects/42/merge_requests/99/changes'
        );
    });

    it('returns [] when the loader yields nothing', async () => {
        const { client } = withLoader(null);
        assert.deepEqual(plain(await client.prChangedFiles(2)), []);
    });

    it('returns [] when the response carries no changes key', async () => {
        const { client } = withLoader({});
        assert.deepEqual(plain(await client.prChangedFiles(2)), []);
    });
});
