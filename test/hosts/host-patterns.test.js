'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { normalizeHostPattern, userOriginsFrom, needsGitlabComNotice, pruneUndetectedSites } = createScope();

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

    it('accepts github.com like any other host', () => {
        assert.equal(normalizeHostPattern('github.com'), 'https://github.com/*');
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
    it('treats every granted https host as a site — none is built in', () => {
        assert.deepEqual(Array.from(userOriginsFrom(
            ['https://gitlab.com/*', 'https://github.com/*', 'https://*/*', 'http://x.example/*'])),
            ['https://github.com/*', 'https://gitlab.com/*']);
    });

    it('dedupes and sorts', () => {
        const origins = ['https://b.acme.com/*', 'https://a.acme.com/*', 'https://b.acme.com/*'];
        assert.deepEqual(arr(userOriginsFrom(origins)), ['https://a.acme.com/*', 'https://b.acme.com/*']);
    });

    it('ignores anything broader than one concrete https host', () => {
        const origins = ['https://*/*', 'http://gitlab.acme.com/*', '<all_urls>', 'https://*.acme.com/*'];
        assert.deepEqual(arr(userOriginsFrom(origins)), []);
    });

    it('survives a missing argument', () => {
        assert.deepEqual(arr(userOriginsFrom(undefined)), []);
    });
});

describe('needsGitlabComNotice', () => {
    it('tells a user updating from a release that had gitlab.com built in, once it is gone', () => {
        assert.equal(needsGitlabComNotice('1.3.0', []), true);
        assert.equal(needsGitlabComNotice('1.2.9', ['https://gitlab.mycompany.com/*']), true);
    });

    it('stays quiet when gitlab.com is still granted or the user never had it built in', () => {
        assert.equal(needsGitlabComNotice('1.3.0', ['https://gitlab.com/*']), false);
        assert.equal(needsGitlabComNotice('1.4.0', []), false);
        assert.equal(needsGitlabComNotice('1.10.0', []), false);
        assert.equal(needsGitlabComNotice(undefined, []), false);
    });
});

describe('pruneUndetectedSites', () => {
    it('keeps a host only while it is still turned on', () => {
        assert.deepEqual(arr(pruneUndetectedSites(['a.io', 'b.io'], ['https://a.io/*'])), ['a.io']);
        assert.deepEqual(arr(pruneUndetectedSites(undefined, [])), []);
    });
});
