'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { createPlatformClient, GitLabPlatformClient } = createScope();

describe('createPlatformClient', () => {
    it('builds a GitLabPlatformClient for kind "gitlab"', () => {
        const client = createPlatformClient({
            kind: 'gitlab',
            projectUrl: 'https://gitlab.example/group/proj',
            hostUrl: 'https://gitlab.example',
            projectId: 42
        });
        assert.ok(client instanceof GitLabPlatformClient);
        // The descriptor's fields drive the built URLs.
        assert.equal(
            client.rawFileUrl('abc', 'a.bpmn'),
            'https://gitlab.example/group/proj/-/raw/abc/a.bpmn'
        );
    });

    it('throws for an unknown platform kind', () => {
        assert.throws(() => createPlatformClient({ kind: 'bitbucket' }), /unsupported platform kind: bitbucket/);
    });

    it('throws for a missing platform', () => {
        assert.throws(() => createPlatformClient(undefined), /unsupported platform kind/);
    });
});
