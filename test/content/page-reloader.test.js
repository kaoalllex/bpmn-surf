'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

// PageReloader guards against an infinite reload loop when data fails to load
// (see the reload-loop bugs): it reloads at most MAX_ATTEMPTS times, tracking
// the count in sessionStorage. location.reload() is a no-op in jsdom, so these
// tests assert the observable contract — the return value and the persisted
// attempt counter — not the reload side effect itself.

const KEY = 'bpmn_diff_reload_attempts';

function freshReloader() {
    const scope = createScope({ url: 'https://gitlab.example/x' });
    scope.window.sessionStorage.clear();
    return { reloader: new scope.PageReloader(), storage: scope.window.sessionStorage };
}

describe('PageReloader.attemptReload', () => {
    let reloader, storage;
    beforeEach(() => { ({ reloader, storage } = freshReloader()); });

    it('returns true and counts the attempt for the first reload', () => {
        assert.equal(reloader.attemptReload(), true);
        assert.equal(storage.getItem(KEY), '1');
    });

    it('reloads up to MAX_ATTEMPTS times', () => {
        assert.equal(reloader.attemptReload(), true);  // 1
        assert.equal(reloader.attemptReload(), true);  // 2
        assert.equal(reloader.attemptReload(), true);  // 3
        assert.equal(storage.getItem(KEY), '3');
    });

    it('stops reloading once the limit is exceeded', () => {
        reloader.attemptReload(); // 1
        reloader.attemptReload(); // 2
        reloader.attemptReload(); // 3
        assert.equal(reloader.attemptReload(), false); // 4th is refused
    });

    it('clears the counter when the limit is reached (so a later genuine load can retry)', () => {
        reloader.attemptReload();
        reloader.attemptReload();
        reloader.attemptReload();
        reloader.attemptReload(); // exceeds the limit
        assert.equal(storage.getItem(KEY), null);
    });
});

describe('PageReloader.reset', () => {
    it('clears the attempt counter', () => {
        const { reloader, storage } = freshReloader();
        reloader.attemptReload();
        assert.equal(storage.getItem(KEY), '1');
        reloader.reset();
        assert.equal(storage.getItem(KEY), null);
    });

    it('lets reloading start over after a reset', () => {
        const { reloader } = freshReloader();
        reloader.attemptReload();
        reloader.attemptReload();
        reloader.reset();
        assert.equal(reloader.attemptReload(), true);
    });
});
