'use strict';

// Unit tests for DifferEmptyState — the canvas-area placeholder shown when the
// diagram is absent in the shown version (blank cover) or in both versions
// (with a message). Lives inside the canvas cell (UX-0003 / BUG-0001).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

function makeContainer(document) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    return container;
}

function stateElement(container) {
    return container.querySelector('.differ-empty-state');
}

describe('DifferEmptyState', () => {
    it('does not touch the DOM on construction (lazy)', () => {
        const { document, DifferEmptyState } = createScope();
        const container = makeContainer(document);
        new DifferEmptyState(container);
        assert.equal(stateElement(container), null);
    });

    it('appends a visible placeholder inside its container on show()', () => {
        const { document, DifferEmptyState } = createScope();
        const container = makeContainer(document);
        new DifferEmptyState(container).show('');

        const element = stateElement(container);
        assert.ok(element, 'placeholder element should be appended to the container');
        assert.equal(element.style.display, 'flex');
    });

    it('makes the container a positioning context for the absolute cover', () => {
        const { document, DifferEmptyState } = createScope();
        const container = makeContainer(document);
        new DifferEmptyState(container).show('');

        assert.equal(container.style.position, 'relative');
    });

    it('renders a blank cover when the message is empty (absent-side case)', () => {
        const { document, DifferEmptyState } = createScope();
        const container = makeContainer(document);
        new DifferEmptyState(container).show('');

        assert.equal(
            stateElement(container).querySelector('.differ-empty-state-message').textContent,
            ''
        );
    });

    it('shows the given message (both-versions-absent case)', () => {
        const { document, DifferEmptyState } = createScope();
        const container = makeContainer(document);
        new DifferEmptyState(container).show('File not found in either version');

        assert.equal(
            stateElement(container).querySelector('.differ-empty-state-message').textContent,
            'File not found in either version'
        );
    });

    it('defaults to a blank message when none is given', () => {
        const { document, DifferEmptyState } = createScope();
        const container = makeContainer(document);
        new DifferEmptyState(container).show();

        assert.equal(
            stateElement(container).querySelector('.differ-empty-state-message').textContent,
            ''
        );
    });

    it('hides the placeholder on hide()', () => {
        const { document, DifferEmptyState } = createScope();
        const container = makeContainer(document);
        const state = new DifferEmptyState(container);
        state.show('x');
        state.hide();

        assert.equal(stateElement(container).style.display, 'none');
    });

    it('hide() before show() is a no-op (no element created)', () => {
        const { document, DifferEmptyState } = createScope();
        const container = makeContainer(document);
        new DifferEmptyState(container).hide();

        assert.equal(stateElement(container), null);
    });

    it('reuses the single element across repeated show() calls', () => {
        const { document, DifferEmptyState } = createScope();
        const container = makeContainer(document);
        const state = new DifferEmptyState(container);
        state.show('first');
        state.hide();
        state.show('second');

        assert.equal(container.querySelectorAll('.differ-empty-state').length, 1);
        assert.equal(stateElement(container).style.display, 'flex');
        assert.equal(
            stateElement(container).querySelector('.differ-empty-state-message').textContent,
            'second'
        );
    });
});
