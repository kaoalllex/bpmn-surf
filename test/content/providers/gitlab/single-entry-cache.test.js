'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

function createCache() {
    const scope = createScope();
    return new scope.SingleEntryCache();
}

describe('SingleEntryCache', () => {
    it('returns null before anything is stored', () => {
        const cache = createCache();
        assert.equal(cache.get('k'), null);
    });

    it('returns the stored value for a matching key', () => {
        const cache = createCache();
        const value = { a: 1 };
        cache.set('k', value);
        assert.equal(cache.get('k'), value);
    });

    it('returns null for a non-matching key', () => {
        const cache = createCache();
        cache.set('k', { a: 1 });
        assert.equal(cache.get('other'), null);
    });

    it('keeps only the last key/value pair', () => {
        const cache = createCache();
        cache.set('k1', { a: 1 });
        cache.set('k2', { b: 2 });
        assert.equal(cache.get('k1'), null);
        assert.deepEqual(cache.get('k2'), { b: 2 });
    });

    it('treats a falsy stored value as a cache miss', () => {
        const cache = createCache();
        cache.set('k', 0);
        assert.equal(cache.get('k'), null);
    });

    it('stores objects whose own fields are falsy (truthy container)', () => {
        const cache = createCache();
        const value = { result: false };
        cache.set('k', value);
        assert.equal(cache.get('k'), value);
    });
});
