'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { EditDiffPainter, EditColorResolver, DiffType } = createScope();

// A canvas double that records the marker calls, mirroring diagram-js' API.
function fakeCanvas() {
    const markers = new Map();
    return {
        markers,
        addMarker(element, marker) {
            const id = element.id;
            if (!markers.has(id)) markers.set(id, new Set());
            markers.get(id).add(marker);
        },
        removeMarker(element, marker) {
            const set = markers.get(element.id);
            if (set) set.delete(marker);
        }
    };
}

const fakeRegistry = (ids) => ({
    get: (id) => (ids.includes(id) ? { id } : undefined)
});

describe('EditDiffPainter', () => {
    it('marks added and changed elements with their own classes', () => {
        const canvas = fakeCanvas();
        const painter = new EditDiffPainter(canvas, fakeRegistry(['A', 'B']));
        painter.paint(EditColorResolver.resolve([
            { ids: ['A'], diffType: DiffType.ADD },
            { ids: ['B'], diffType: DiffType.CHANGE }
        ]));
        assert.deepEqual([...canvas.markers.get('A')], ['edit-diff-added']);
        assert.deepEqual([...canvas.markers.get('B')], ['edit-diff-changed']);
    });

    it('adds the outline modifier for an explicitly coloured element', () => {
        const canvas = fakeCanvas();
        const painter = new EditDiffPainter(canvas, fakeRegistry(['A']));
        painter.paint(EditColorResolver.resolve(
            [{ ids: ['A'], diffType: DiffType.ADD }], new Set(['A'])));
        assert.deepEqual(
            [...canvas.markers.get('A')].sort(), ['edit-diff-added', 'edit-diff-outline']);
    });

    it('removes the previous markers on repaint', () => {
        const canvas = fakeCanvas();
        const painter = new EditDiffPainter(canvas, fakeRegistry(['A']));
        painter.paint(EditColorResolver.resolve([{ ids: ['A'], diffType: DiffType.ADD }]));
        painter.paint(EditColorResolver.resolve([{ ids: ['A'], diffType: DiffType.CHANGE }]));
        assert.deepEqual([...canvas.markers.get('A')], ['edit-diff-changed']);
    });

    it('clears everything when painting an empty map (the toggle went off)', () => {
        const canvas = fakeCanvas();
        const painter = new EditDiffPainter(canvas, fakeRegistry(['A']));
        painter.paint(EditColorResolver.resolve([{ ids: ['A'], diffType: DiffType.ADD }]));
        painter.paint(new Map());
        assert.equal(canvas.markers.get('A').size, 0);
    });

    it('skips ids that are no longer in the registry', () => {
        // An element deleted between the recompute and the paint.
        const canvas = fakeCanvas();
        const painter = new EditDiffPainter(canvas, fakeRegistry([]));
        painter.paint(EditColorResolver.resolve([{ ids: ['Gone'], diffType: DiffType.ADD }]));
        assert.equal(canvas.markers.size, 0);
    });
});
