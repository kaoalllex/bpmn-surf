'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

// detectPlatformKind takes a location-like { hostname, href } (defaulting to
// window.location in prod), so the tests feed plain objects — no globals.
const { detectPlatformKind, PLATFORM_KIND } = createScope();

function loc(href) {
    return { href, hostname: new URL(href).hostname };
}

describe('detectPlatformKind', () => {
    it('detects github.com as github', () => {
        assert.equal(detectPlatformKind(loc('https://github.com/owner/repo/pull/5/files')), PLATFORM_KIND.GITHUB);
    });

    it('detects the self-managed gitlab host as gitlab', () => {
        assert.equal(detectPlatformKind(loc('https://gitlab.example.com/group/proj/-/merge_requests/5/diffs')), PLATFORM_KIND.GITLAB);
    });

    it('detects gitlab.com as gitlab', () => {
        assert.equal(detectPlatformKind(loc('https://gitlab.com/group/proj/-/blob/master/a.bpmn')), PLATFORM_KIND.GITLAB);
    });

    it('detects any url containing the gitlab substring as gitlab', () => {
        assert.equal(detectPlatformKind(loc('https://my-gitlab.example.com/group/proj')), PLATFORM_KIND.GITLAB);
    });

    it('prefers github over the loose gitlab substring (order matters)', () => {
        // A github.com URL with "gitlab" in the path must read as github, not
        // gitlab — the github matcher is checked first.
        assert.equal(detectPlatformKind(loc('https://github.com/org/gitlab-mirror/pull/1/files')), PLATFORM_KIND.GITHUB);
    });

    it('treats any other injected host as gitlab', () => {
        // Content scripts only run where the user granted the host (FEAT-0033),
        // so a host matching nothing more specific is a configured GitLab that
        // need not carry the word "gitlab" in its name.
        assert.equal(detectPlatformKind(loc('https://code.acme.com/group/proj')), PLATFORM_KIND.GITLAB);
    });
});
