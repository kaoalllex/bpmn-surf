'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { UpdateChecker } = createScope();

// Builds a checker with injected fetchers so no real network is touched.
function checker({ json, text } = {}) {
    return new UpdateChecker({
        fetchJson: async () => {
            if (json instanceof Error) throw json;
            return json;
        },
        fetchText: async () => {
            if (text instanceof Error) throw text;
            return text;
        }
    });
}

describe('UpdateChecker.check — configuration', () => {
    it('is a no-op when the manifest URL is empty', async () => {
        const result = await checker().check({ manifestUrl: '', currentVersion: '0.18.0' });
        assert.equal(result.configured, false);
        assert.equal(result.updateAvailable, false);
    });
});

describe('UpdateChecker.check — newer version available', () => {
    it('reports an available update with download url and changes', async () => {
        const c = checker({
            json: { version: '0.19.0', downloadUrl: 'https://example/dl', changelogUrl: 'https://example/cl' },
            text: '## 0.19.0\n- new thing\n\n## 0.18.0\n- old'
        });
        const result = await c.check({ manifestUrl: 'https://example/v.json', currentVersion: '0.18.0' });
        assert.equal(result.configured, true);
        assert.equal(result.updateAvailable, true);
        assert.equal(result.latestVersion, '0.19.0');
        assert.equal(result.downloadUrl, 'https://example/dl');
        assert.equal(result.changes.length, 1);
        assert.equal(result.changes[0].version, '0.19.0');
    });

    it('keeps the update even if changelog fetch fails (notes are optional)', async () => {
        const c = checker({
            json: { version: '0.19.0', changelogUrl: 'https://example/cl' },
            text: new Error('boom')
        });
        const result = await c.check({ manifestUrl: 'https://example/v.json', currentVersion: '0.18.0' });
        assert.equal(result.updateAvailable, true);
        assert.equal(result.changes.length, 0);
    });

    it('prefers the explicit changelogUrl over the one in the manifest', async () => {
        let seenUrl = null;
        const c = new UpdateChecker({
            fetchJson: async () => ({ version: '0.19.0', changelogUrl: 'https://manifest/cl' }),
            fetchText: async url => { seenUrl = url; return '## 0.19.0\n- x'; }
        });
        await c.check({ manifestUrl: 'https://example/v.json', changelogUrl: 'https://explicit/cl', currentVersion: '0.18.0' });
        assert.equal(seenUrl, 'https://explicit/cl');
    });
});

describe('UpdateChecker.check — no update', () => {
    it('reports no update when on the same version', async () => {
        const c = checker({ json: { version: '0.18.0' } });
        const result = await c.check({ manifestUrl: 'https://example/v.json', currentVersion: '0.18.0' });
        assert.equal(result.updateAvailable, false);
        assert.equal(result.changes.length, 0);
    });

    it('does not fetch the changelog when there is no newer version', async () => {
        let fetchedNotes = false;
        const c = new UpdateChecker({
            fetchJson: async () => ({ version: '0.18.0', changelogUrl: 'https://example/cl' }),
            fetchText: async () => { fetchedNotes = true; return ''; }
        });
        await c.check({ manifestUrl: 'https://example/v.json', currentVersion: '0.18.0' });
        assert.equal(fetchedNotes, false);
    });
});

describe('UpdateChecker.check — failures', () => {
    it('returns an error string when the manifest fetch fails', async () => {
        const c = checker({ json: new Error('network down') });
        const result = await c.check({ manifestUrl: 'https://example/v.json', currentVersion: '0.18.0' });
        assert.equal(result.updateAvailable, false);
        assert.match(result.error, /network down/);
    });
});
