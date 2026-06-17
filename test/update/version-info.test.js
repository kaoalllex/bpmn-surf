'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { VersionInfo } = createScope();

// Arrays created inside the vm realm have that realm's Array.prototype, so
// assert.deepEqual against a host [] fails on prototype identity. Array.from
// (host) rebuilds them as host arrays of the same primitive elements.
const arr = x => Array.from(x);

describe('VersionInfo.parse', () => {
    it('splits a plain version into numbers', () => {
        assert.deepEqual(arr(VersionInfo.parse('0.18.0')), [0, 18, 0]);
    });

    it('strips a leading v', () => {
        assert.deepEqual(arr(VersionInfo.parse('v1.2.3')), [1, 2, 3]);
    });

    it('strips surrounding brackets', () => {
        assert.deepEqual(arr(VersionInfo.parse('[1.2.3]')), [1, 2, 3]);
    });

    it('treats non-numeric parts as 0', () => {
        assert.deepEqual(arr(VersionInfo.parse('1.x.3')), [1, 0, 3]);
    });

    it('returns [] for empty string', () => {
        assert.deepEqual(arr(VersionInfo.parse('   ')), []);
    });

    it('returns [] for non-strings', () => {
        assert.deepEqual(arr(VersionInfo.parse(null)), []);
        assert.deepEqual(arr(VersionInfo.parse(undefined)), []);
        assert.deepEqual(arr(VersionInfo.parse(42)), []);
    });
});

describe('VersionInfo.compare', () => {
    it('returns 0 for equal versions', () => {
        assert.equal(VersionInfo.compare('0.18.0', '0.18.0'), 0);
    });

    it('compares numerically, not lexically (18 > 9)', () => {
        assert.equal(VersionInfo.compare('0.18.0', '0.9.0'), 1);
        assert.equal(VersionInfo.compare('0.9.0', '0.18.0'), -1);
    });

    it('compares patch level', () => {
        assert.equal(VersionInfo.compare('0.18.1', '0.18.0'), 1);
        assert.equal(VersionInfo.compare('0.18.0', '0.18.1'), -1);
    });

    it('treats missing trailing parts as 0', () => {
        assert.equal(VersionInfo.compare('1.2', '1.2.0'), 0);
        assert.equal(VersionInfo.compare('1.2', '1.2.1'), -1);
        assert.equal(VersionInfo.compare('1.2.0.0', '1.2'), 0);
    });

    it('compares major level', () => {
        assert.equal(VersionInfo.compare('2.0.0', '1.99.99'), 1);
    });
});

describe('VersionInfo.isNewer', () => {
    it('is true when latest is strictly newer', () => {
        assert.equal(VersionInfo.isNewer('0.18.0', '0.19.0'), true);
        assert.equal(VersionInfo.isNewer('0.18.0', '0.18.1'), true);
    });

    it('is false when equal', () => {
        assert.equal(VersionInfo.isNewer('0.18.0', '0.18.0'), false);
    });

    it('is false when latest is older', () => {
        assert.equal(VersionInfo.isNewer('0.19.0', '0.18.0'), false);
    });

    it('is false when latest is empty/invalid (never announce nothing)', () => {
        assert.equal(VersionInfo.isNewer('0.18.0', ''), false);
        assert.equal(VersionInfo.isNewer('0.18.0', null), false);
    });
});

describe('VersionInfo.parseChangelog', () => {
    const md = [
        '# Changelog',
        '',
        '## 0.19.0',
        '- feature A',
        '- feature B',
        '',
        '## 0.18.0',
        '- fix C',
        ''
    ].join('\n');

    it('splits into entries newest-first in file order', () => {
        const entries = VersionInfo.parseChangelog(md);
        assert.deepEqual(arr(entries.map(e => e.version)), ['0.19.0', '0.18.0']);
    });

    it('captures the body per entry, trimmed', () => {
        const entries = VersionInfo.parseChangelog(md);
        assert.equal(entries[0].body, '- feature A\n- feature B');
        assert.equal(entries[1].body, '- fix C');
    });

    it('normalizes v-prefixed and bracketed headings', () => {
        const entries = VersionInfo.parseChangelog('## v1.0.0\nx\n## [0.9.0]\ny');
        assert.deepEqual(arr(entries.map(e => e.version)), ['1.0.0', '0.9.0']);
    });

    it('does not treat ### subheadings as version entries', () => {
        const entries = VersionInfo.parseChangelog('## 1.0.0\n### details\n- x');
        assert.equal(entries.length, 1);
        assert.equal(entries[0].version, '1.0.0');
        assert.equal(entries[0].body, '### details\n- x');
    });

    it('returns [] for non-strings', () => {
        assert.deepEqual(arr(VersionInfo.parseChangelog(null)), []);
    });
});

describe('VersionInfo.changesSince', () => {
    const md = '## 0.20.0\nnew\n\n## 0.19.0\nmid\n\n## 0.18.0\nold';

    it('returns only entries newer than the current version', () => {
        const changes = VersionInfo.changesSince(md, '0.18.0');
        assert.deepEqual(arr(changes.map(e => e.version)), ['0.20.0', '0.19.0']);
    });

    it('returns nothing when already on the latest', () => {
        assert.equal(VersionInfo.changesSince(md, '0.20.0').length, 0);
    });

    it('returns everything when far behind', () => {
        const changes = VersionInfo.changesSince(md, '0.1.0');
        assert.equal(changes.length, 3);
    });
});
