'use strict';

// Unit tests for DifferLoadingOverlay — the shared render spinner shown on the
// differ page and hidden in showCanvas() (UX-0008).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

function overlayElement(document) {
    return document.querySelector('.differ-loading-overlay');
}

describe('DifferLoadingOverlay', () => {
    it('does not touch the DOM on construction (lazy)', () => {
        const { document, DifferLoadingOverlay } = createScope();
        new DifferLoadingOverlay();
        assert.equal(overlayElement(document), null);
    });

    it('appends a visible overlay with a spinner on show()', () => {
        const { document, DifferLoadingOverlay } = createScope();
        new DifferLoadingOverlay().show();

        const overlay = overlayElement(document);
        assert.ok(overlay, 'overlay element should be appended to the body');
        assert.equal(overlay.style.display, 'flex');
        assert.ok(overlay.querySelector('.differ-spinner'), 'overlay should contain a spinner');
    });

    it('shows the given message', () => {
        const { document, DifferLoadingOverlay } = createScope();
        new DifferLoadingOverlay().show('Loading the diagram…');

        assert.equal(
            overlayElement(document).querySelector('.differ-loading-message').textContent,
            'Loading the diagram…'
        );
    });

    it('defaults to an empty message when none is given', () => {
        const { document, DifferLoadingOverlay } = createScope();
        new DifferLoadingOverlay().show();

        assert.equal(
            overlayElement(document).querySelector('.differ-loading-message').textContent,
            ''
        );
    });

    it('hides the overlay on hide()', () => {
        const { document, DifferLoadingOverlay } = createScope();
        const overlay = new DifferLoadingOverlay();
        overlay.show();
        overlay.hide();

        assert.equal(overlayElement(document).style.display, 'none');
    });

    it('hide() before show() is a no-op (no overlay created)', () => {
        const { document, DifferLoadingOverlay } = createScope();
        new DifferLoadingOverlay().hide();

        assert.equal(overlayElement(document), null);
    });

    it('reuses the single overlay element across repeated show() calls', () => {
        const { document, DifferLoadingOverlay } = createScope();
        const overlay = new DifferLoadingOverlay();
        overlay.show('first');
        overlay.hide();
        overlay.show('second');

        assert.equal(document.querySelectorAll('.differ-loading-overlay').length, 1);
        assert.equal(overlayElement(document).style.display, 'flex');
        assert.equal(
            overlayElement(document).querySelector('.differ-loading-message').textContent,
            'second'
        );
    });
});
