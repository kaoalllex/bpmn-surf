'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

// GitLabRepoProvider reads the realm's global document, so each test gets a
// fresh scope; loadContent is injected, so no network is involved.

describe('GitLabRepoProvider.getSourceCommitId', () => {
    it('falls back to diff_head_sha on the page when commits.json names no commit', async () => {
        const scope = createScope();
        scope.document.body.innerHTML =
            `<div id="js-vue-mr-discussions" data-noteable-data='{"diff_head_sha":"abc123"}'></div>`;
        const provider = new scope.GitLabRepoProvider(async () => 'no commit reference here');

        assert.equal(await provider.getSourceCommitId(), 'abc123');
    });

    it('prefers the last commit listed in commits.json', async () => {
        const scope = createScope();
        scope.document.body.innerHTML =
            `<div id="js-vue-mr-discussions" data-noteable-data='{"diff_head_sha":"abc123"}'></div>`;
        const provider = new scope.GitLabRepoProvider(async () => '<a href="/x/diffs?commit_id=def456">');

        assert.equal(await provider.getSourceCommitId(), 'def456');
    });
});
