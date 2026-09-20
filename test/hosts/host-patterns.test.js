'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { normalizeHostPattern, userOriginsFrom } = createScope();

// Arrays built inside the vm realm carry that realm's prototype, so deepEqual
// against a host array fails on identity — Array.from rebuilds them (docs/testing.md).
const arr = x => Array.from(x);

describe('normalizeHostPattern', () => {
    it('turns a bare host into a single-origin match pattern', () => {
        assert.equal(normalizeHostPattern('gitlab.acme.com'), 'https://gitlab.acme.com/*');
    });

    it('accepts an https origin', () => {
        assert.equal(normalizeHostPattern('https://gitlab.acme.com'), 'https://gitlab.acme.com/*');
    });

    it('accepts a pasted merge request url', () => {
        assert.equal(
            normalizeHostPattern('https://gitlab.acme.com/group/proj/-/merge_requests/5/diffs'),
            'https://gitlab.acme.com/*'
        );
    });

    it('lowercases the host and drops the port', () => {
        assert.equal(normalizeHostPattern('HTTPS://GitLab.Acme.com:8443/x'), 'https://gitlab.acme.com/*');
    });

    it('trims surrounding whitespace', () => {
        assert.equal(normalizeHostPattern('  gitlab.acme.com  '), 'https://gitlab.acme.com/*');
    });

    it('accepts a single-label internal host', () => {
        assert.equal(normalizeHostPattern('gitlab'), 'https://gitlab/*');
    });

    it('rejects http — the extension asks for https origins only', () => {
        assert.equal(normalizeHostPattern('http://gitlab.acme.com'), null);
    });

    it('rejects a wildcard host', () => {
        assert.equal(normalizeHostPattern('https://*.acme.com/*'), null);
        assert.equal(normalizeHostPattern('*'), null);
    });

    it('rejects empty and missing input', () => {
        assert.equal(normalizeHostPattern(''), null);
        assert.equal(normalizeHostPattern('   '), null);
        assert.equal(normalizeHostPattern(null), null);
        assert.equal(normalizeHostPattern(undefined), null);
    });

    it('rejects an unparseable host', () => {
        assert.equal(normalizeHostPattern('not a host'), null);
        assert.equal(normalizeHostPattern('https://'), null);
        assert.equal(normalizeHostPattern('gitlab_acme.com'), null);
    });
});

describe('userOriginsFrom', () => {
    const declared = ['https://gitlab.com/*'];

    it('drops the origins the manifest already declares', () => {
        const origins = ['https://gitlab.com/*', 'https://gitlab.acme.com/*'];
        assert.deepEqual(arr(userOriginsFrom(origins, declared)), ['https://gitlab.acme.com/*']);
    });

    it('dedupes and sorts what is left', () => {
        const origins = ['https://b.acme.com/*', 'https://a.acme.com/*', 'https://b.acme.com/*'];
        assert.deepEqual(arr(userOriginsFrom(origins, declared)), ['https://a.acme.com/*', 'https://b.acme.com/*']);
    });

    it('ignores anything broader than one concrete https host', () => {
        const origins = ['https://*/*', 'http://gitlab.acme.com/*', '<all_urls>', 'https://*.acme.com/*'];
        assert.deepEqual(arr(userOriginsFrom(origins, declared)), []);
    });

    it('survives missing arguments', () => {
        assert.deepEqual(arr(userOriginsFrom(undefined, declared)), []);
        assert.deepEqual(arr(userOriginsFrom(['https://gitlab.acme.com/*'], undefined)), ['https://gitlab.acme.com/*']);
    });
});
