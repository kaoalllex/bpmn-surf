'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { EditSession } = createScope();

describe('EditSession.editedFileName', () => {
    it('inserts the local timestamp before the extension', () => {
        const name = EditSession.editedFileName(
            'order-process.bpmn', new Date(2026, 7, 21, 9, 5, 3));
        assert.equal(name, 'order-process-edited-20260821-090503.bpmn');
    });

    it('does not double the extension', () => {
        const name = EditSession.editedFileName('a.bpmn', new Date(2026, 0, 1, 0, 0, 0));
        assert.equal(name, 'a-edited-20260101-000000.bpmn');
    });

    it('appends the extension when the name has none', () => {
        const name = EditSession.editedFileName('a', new Date(2026, 0, 1, 0, 0, 0));
        assert.equal(name, 'a-edited-20260101-000000.bpmn');
    });

    it('matches the extension case-insensitively', () => {
        const name = EditSession.editedFileName('A.BPMN', new Date(2026, 0, 1, 0, 0, 0));
        assert.equal(name, 'A-edited-20260101-000000.bpmn');
    });
});

// A modeler double: enough of the bpmn-js injector surface for the session, with
// a hand-held commandStack.changed listener so a test can fire a recompute.
function fakeModeler({ xml = '<x/>', xmlQueue = null } = {}) {
    let listener = null;
    const painted = [];
    return {
        painted,
        fire: () => listener && listener(),
        saveXML: async () => ({ xml: xmlQueue && xmlQueue.length ? xmlQueue.shift() : xml }),
        get: (name) => ({
            eventBus: { on: (event, handler) => { if (event === 'commandStack.changed') listener = handler; } },
            commandStack: { canUndo: () => false },
            elementRegistry: { getAll: () => [] }
        }[name])
    };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = () => wait(EditSession.RECOMPUTE_DEBOUNCE_MS + 150);

describe('EditSession recompute', () => {
    it('signals paused when the comparison throws and keeps the last colouring', async () => {
        // BUG-0029: compare() throws on a diagram with no executable process.
        const modeler = fakeModeler();
        const paintCalls = [];
        const paused = [];
        const session = new EditSession({
            modeler,
            comparator: { compare: () => { throw new TypeError('no executable process'); } },
            painter: { paint: (map) => paintCalls.push(map) },
            propertiesPanelHighlighter: { setDiffData: () => {} },
            onColoringPaused: (value) => paused.push(value)
        });
        await session.start();
        const paintsAfterStart = paintCalls.length;

        modeler.fire();
        await settle();

        assert.deepEqual(paused, [true]);
        // commandStack.changed still triggers one eager, colour-only repaint (so a
        // manual colour click is reflected immediately, see EditSession#start), but
        // the failed diff recompute's catch must return before its own repaint —
        // so the colouring is exactly what it was before the throw, never flashed
        // clean by a second, different one.
        assert.equal(paintCalls.length, paintsAfterStart + 1);
        assert.deepEqual(paintCalls[paintCalls.length - 1], paintCalls[paintsAfterStart - 1]);
    });

    it('clears the paused signal once the comparison succeeds again', async () => {
        const modeler = fakeModeler();
        let shouldThrow = true;
        const paused = [];
        const session = new EditSession({
            modeler,
            comparator: {
                compare: () => {
                    if (shouldThrow) throw new TypeError('no executable process');
                    return emptyDiff();
                }
            },
            painter: { paint: () => {} },
            propertiesPanelHighlighter: { setDiffData: () => {} },
            onColoringPaused: (value) => paused.push(value)
        });
        await session.start();

        modeler.fire();
        await settle();
        shouldThrow = false;
        modeler.fire();
        await settle();

        assert.deepEqual(paused, [true, false]);
    });

    it('does not repeat the paused signal while the streak lasts', async () => {
        const modeler = fakeModeler();
        const paused = [];
        const session = new EditSession({
            modeler,
            comparator: { compare: () => { throw new TypeError('boom'); } },
            painter: { paint: () => {} },
            propertiesPanelHighlighter: { setDiffData: () => {} },
            onColoringPaused: (value) => paused.push(value)
        });
        await session.start();

        modeler.fire();
        await settle();
        modeler.fire();
        await settle();

        assert.deepEqual(paused, [true]);
    });

    // `saveXML()` is async while `commandStack.changed` is not, so two recomputes
    // can be in flight at once and finish out of order — the `#recomputeToken`
    // guard is the whole fix (see EditSession header comment). Simulated here with
    // a manually-resolved promise standing in for a slow saveXML(): recompute A
    // starts first but its export is held open; recompute B starts later (A still
    // in flight) and its export resolves immediately, so B finishes first. A must
    // then find itself superseded and never reach the comparator when it finally
    // resolves.
    it('lets a later, faster recompute win over an earlier one still in flight', async () => {
        const xmlQueue = [];
        const modeler = fakeModeler({ xml: 'baseline-xml', xmlQueue });
        const compareCalls = [];
        const session = new EditSession({
            modeler,
            comparator: {
                compare: (xml) => {
                    compareCalls.push(xml);
                    return emptyDiff();
                }
            },
            painter: { paint: () => {} },
            propertiesPanelHighlighter: { setDiffData: () => {} },
            onColoringPaused: () => {}
        });
        await session.start(); // consumes the default baseline xml; queue still empty

        let resolveA;
        xmlQueue.push(new Promise((resolve) => { resolveA = resolve; }));
        modeler.fire(); // edit A
        await settle(); // recompute A starts, blocks on its (held-open) saveXML()

        xmlQueue.push('edit-b-xml');
        modeler.fire(); // edit B
        await settle(); // recompute B starts and, unlike A, resolves right away

        assert.deepEqual(compareCalls, ['edit-b-xml']);

        resolveA('edit-a-xml'); // let the superseded recompute A finally resolve
        await wait(50);

        // A's stale export must never reach the comparator (and so never paint):
        // the token guard caught it before that point.
        assert.deepEqual(compareCalls, ['edit-b-xml']);
    });
});

function emptyDiff() {
    return {
        missingShapeIds: [], missingRowIds: [],
        changedShapeIds: [], changedRowIds: [],
        nodeIdToDiffsMap: new Map(),
        nodeIdToConditions: new Map(),
        nodeIdToMappingChanges: new Map()
    };
}
