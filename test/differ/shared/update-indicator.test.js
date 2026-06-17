'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { UpdateIndicator, document } = createScope();

describe('UpdateIndicator.isAvailable', () => {
    it('is true when an update with a version is present', () => {
        const ind = new UpdateIndicator({ updateAvailable: true, latestVersion: '0.19.0' });
        assert.equal(ind.isAvailable(), true);
    });

    it('is false when no update info', () => {
        assert.equal(new UpdateIndicator(null).isAvailable(), false);
        assert.equal(new UpdateIndicator(undefined).isAvailable(), false);
    });

    it('is false when updateAvailable is false', () => {
        const ind = new UpdateIndicator({ updateAvailable: false, latestVersion: '0.19.0' });
        assert.equal(ind.isAvailable(), false);
    });

    it('is false when version is missing', () => {
        const ind = new UpdateIndicator({ updateAvailable: true });
        assert.equal(ind.isAvailable(), false);
    });
});

describe('UpdateIndicator.createElement', () => {
    it('returns null when no update is available', () => {
        const ind = new UpdateIndicator({ updateAvailable: false });
        assert.equal(ind.createElement(() => {}), null);
    });

    it('renders the latest version label', () => {
        const ind = new UpdateIndicator({ updateAvailable: true, latestVersion: '0.19.0' });
        const el = ind.createElement(() => {});
        assert.ok(el);
        assert.match(el.textContent, /0\.19\.0/);
        assert.ok(el.className.includes('differ-update-indicator'));
    });

    it('invokes onActivate on click', () => {
        const ind = new UpdateIndicator({ updateAvailable: true, latestVersion: '0.19.0' });
        let activated = 0;
        const el = ind.createElement(() => { activated++; });
        el.dispatchEvent(new document.defaultView.Event('click'));
        assert.equal(activated, 1);
    });
});
