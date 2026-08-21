'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { EditColorResolver, DiffType } = createScope();

describe('EditColorResolver', () => {
    it('paints each layer with its own diff type', () => {
        const map = EditColorResolver.resolve([
            { ids: ['A'], diffType: DiffType.ADD },
            { ids: ['B'], diffType: DiffType.CHANGE }
        ]);
        assert.equal(map.get('A').diffType, DiffType.ADD);
        assert.equal(map.get('B').diffType, DiffType.CHANGE);
        assert.equal(map.size, 2);
    });

    it('gives the earlier layer priority over the later one', () => {
        // My own edit (layer 2) outranks the MR diff (layer 3) on the same element.
        const map = EditColorResolver.resolve([
            { ids: ['A'], diffType: DiffType.CHANGE },
            { ids: ['A'], diffType: DiffType.ADD }
        ]);
        assert.equal(map.get('A').diffType, DiffType.CHANGE);
    });

    it('marks an explicitly coloured element as outline-only', () => {
        // A colour in the model (set by the user, or shipped with the file) wins,
        // so we outline the element instead of filling over its colour.
        const map = EditColorResolver.resolve(
            [{ ids: ['A', 'B'], diffType: DiffType.ADD }], new Set(['A']));
        assert.equal(map.get('A').outlineOnly, true);
        assert.equal(map.get('B').outlineOnly, false);
    });

    it('returns an empty map for no layers (the toggle is off)', () => {
        assert.equal(EditColorResolver.resolve([]).size, 0);
    });

    it('tolerates a layer with no ids', () => {
        const map = EditColorResolver.resolve([{ diffType: DiffType.ADD }]);
        assert.equal(map.size, 0);
    });

    it('reads explicit colours off the element registry, both namespaces', () => {
        const di = (attrs) => ({ get: (name) => attrs[name] });
        const registry = {
            getAll: () => [
                { id: 'plain', di: di({}) },
                { id: 'omg', di: di({ 'color:background-color': '#ff0000' }) },
                { id: 'legacyFill', di: di({ 'bioc:fill': '#00ff00' }) },
                { id: 'omgBorder', di: di({ 'color:border-color': '#0000ff' }) },
                { id: 'legacyStroke', di: di({ 'bioc:stroke': '#000000' }) },
                { id: 'noDi' }
            ]
        };
        const ids = EditColorResolver.explicitlyColoredIdsOf(registry);
        assert.deepEqual(
            [...ids].sort(), ['legacyFill', 'legacyStroke', 'omg', 'omgBorder']);
    });
});
