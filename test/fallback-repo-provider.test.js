'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('./support/scope.js');

const { FallbackRepoProvider, GitLabApiRepoProvider } = createScope();

// A minimal RepoProvider stub. `available` / `initResult` drive the selection
// logic; the other methods echo `name` so we can assert which provider the
// chain delegates to.
function stub(name, { available = true, initResult = true, initThrows = false } = {}) {
    return {
        name,
        initCalls: 0,
        isAvailable() { return available; },
        async init() {
            this.initCalls++;
            if (initThrows) {
                throw new Error(`${name} init failed`);
            }
            return initResult;
        },
        getProjectInfo() { return name; },
        async isChangeViewActive() { return name; },
        getChangeInfo() { return name; }
    };
}

describe('FallbackRepoProvider.isAvailable', () => {
    it('is true when any provider is available', () => {
        const p = new FallbackRepoProvider([stub('a', { available: false }), stub('b')]);
        assert.equal(p.isAvailable(), true);
    });

    it('is false when no provider is available', () => {
        const p = new FallbackRepoProvider([stub('a', { available: false }), stub('b', { available: false })]);
        assert.equal(p.isAvailable(), false);
    });
});

describe('FallbackRepoProvider.init selection', () => {
    it('selects the first available provider that initializes and delegates to it', async () => {
        const primary = stub('primary');
        const fallback = stub('fallback');
        const p = new FallbackRepoProvider([primary, fallback]);

        assert.equal(await p.init(), true);
        assert.equal(p.getProjectInfo(), 'primary');
        assert.equal(fallback.initCalls, 0, 'fallback must not be initialized once primary wins');
    });

    it('skips an unavailable provider and uses the next available one', async () => {
        const p = new FallbackRepoProvider([stub('disabled', { available: false }), stub('fallback')]);

        assert.equal(await p.init(), true);
        assert.equal(p.getProjectInfo(), 'fallback');
    });

    it('falls back to the next provider when the primary init returns false', async () => {
        const p = new FallbackRepoProvider([stub('primary', { initResult: false }), stub('fallback')]);

        assert.equal(await p.init(), true);
        assert.equal(p.getProjectInfo(), 'fallback');
    });

    it('falls back to the next provider when the primary init throws', async () => {
        const p = new FallbackRepoProvider([stub('primary', { initThrows: true }), stub('fallback')]);

        assert.equal(await p.init(), true);
        assert.equal(p.getProjectInfo(), 'fallback');
    });

    it('returns false when no provider can initialize', async () => {
        const p = new FallbackRepoProvider([stub('a', { initResult: false }), stub('b', { available: false })]);

        assert.equal(await p.init(), false);
    });
});

describe('FallbackRepoProvider delegation', () => {
    it('delegates async methods to the active provider', async () => {
        const p = new FallbackRepoProvider([stub('primary')]);
        await p.init();
        assert.equal(await p.isChangeViewActive(), 'primary');
        assert.equal(p.getChangeInfo(), 'primary');
    });

    it('throws when a method is called before a provider was selected', () => {
        const p = new FallbackRepoProvider([stub('primary')]);
        assert.throws(() => p.getProjectInfo(), /no active provider/);
    });

    it('re-selects on each init call', async () => {
        const primary = stub('primary', { available: false });
        const p = new FallbackRepoProvider([primary, stub('fallback')]);

        await p.init();
        assert.equal(p.getProjectInfo(), 'fallback');

        primary.isAvailable = () => true;
        await p.init();
        assert.equal(p.getProjectInfo(), 'primary');
    });
});

describe('GitLabApiRepoProvider (seam)', () => {
    it('is disabled until REFAC-0001 implements it', () => {
        const p = new GitLabApiRepoProvider();
        assert.equal(p.isAvailable(), false);
    });

    it('init is not implemented yet', async () => {
        const p = new GitLabApiRepoProvider();
        await assert.rejects(() => p.init(), /not implemented yet/);
    });
});
