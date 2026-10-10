'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

// detectPlatformKind takes a location-like { hostname, href } and a document
// (defaulting to window.location / document in prod), so the tests feed a plain
// object and a parsed page — no globals. A fresh scope per call keeps the
// per-page override from leaking between cases.
function detect(href, head = '', body = '', override = null) {
    const scope = createScope();
    const doc = new scope.window.DOMParser().parseFromString(`<html><head>${head}</head><body ${body}></body></html>`, 'text/html');
    if (override) scope.setSiteKindOverride(override);
    return { kind: scope.detectPlatformKind({ href, hostname: new URL(href).hostname }, doc), K: scope.PLATFORM_KIND };
}

const GITHUB_HEAD = '<meta property="og:site_name" content="GitHub"><meta name="expected-hostname" content="ghe.example.com">';
const GITLAB_HEAD = '<meta content="GitLab" property="og:site_name">';

describe('detectPlatformKind', () => {
    it('knows github.com and gitlab.com by name, whatever the page says', () => {
        assert.equal(detect('https://github.com/o/r/pull/5/files').kind, 'github');
        assert.equal(detect('https://gitlab.com/g/p/-/merge_requests/1/diffs', GITHUB_HEAD).kind, 'gitlab');
    });

    it('reads GitHub Enterprise Server from its markup', () => {
        assert.equal(detect('https://ghe.example.com/o/r/pull/5/files', GITHUB_HEAD).kind, 'github');
        assert.equal(detect('https://ghe.example.com/o/r', '<meta name="expected-hostname" content="ghe.example.com">').kind, 'github');
    });

    it('reads a self-managed GitLab from og:site_name or body[data-page] (custom branding)', () => {
        assert.equal(detect('https://git.acme.io/g/p', GITLAB_HEAD).kind, 'gitlab');
        assert.equal(detect('https://git.acme.io/g/p', '', 'data-page="projects:show"').kind, 'gitlab');
    });

    it('leaves a page that says neither to the user', () => {
        assert.equal(detect('https://intranet.acme.io/').kind, null);
        assert.equal(detect('https://my-gitlab.example.com/g/p').kind, null);  // the name alone proves nothing
    });

    it('lets the user\'s choice win over the markup on their own hosts, never on github.com/gitlab.com', () => {
        assert.equal(detect('https://git.acme.io/g/p', GITLAB_HEAD, '', 'github').kind, 'github');
        assert.equal(detect('https://intranet.acme.io/', '', '', 'gitlab').kind, 'gitlab');
        assert.equal(detect('https://github.com/o/r', '', '', 'gitlab').kind, 'github');
        assert.equal(detect('https://git.acme.io/', GITLAB_HEAD, '', 'bogus').kind, 'gitlab');  // invalid override ignored
    });
});
