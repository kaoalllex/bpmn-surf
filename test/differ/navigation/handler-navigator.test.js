'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

// Minimal moddle-like BO: get(name) reads camunda attributes; `type`/`topic`
// are plain properties (as camunda-moddle defines the external-task fields).
function bo({ attrs = {}, type, topic, eventDefinitions } = {}) {
    return { type, topic, eventDefinitions, get: (name) => attrs[name] };
}

function msgDef(opts) {
    const def = bo(opts);
    def.$type = 'bpmn:MessageEventDefinition';
    return def;
}

// Records every overlays.add() call so a test can count the badges produced.
function fakeOverlays() {
    const added = [];
    return {
        added,
        add(elementId, type, opts) {
            const id = `ov${added.length}`;
            added.push({ elementId, type, opts, id });
            return id;
        },
        remove() { /* tracked ids only; nothing to assert here */ }
    };
}

function fakeRegistry(elements) {
    return {
        getAll: () => elements,
        get: (id) => elements.find(e => e.id === id) || null
    };
}

describe('HandlerNavigator.refreshChangedBadges — labels (BUG-0016)', () => {
    let HandlerNavigator;

    beforeEach(() => {
        ({ HandlerNavigator } = createScope());
    });

    function navigator(overlays, registry) {
        // Only overlays + elementRegistry are exercised here; the rest are unused
        // by refreshChangedBadges and may stay null/no-op.
        return new HandlerNavigator(overlays, registry, null, null, () => null, () => null, () => null, () => false);
    }

    it('adds a single badge for a host element, not its external label', () => {
        const host = { id: 'Task', businessObject: bo({ attrs: { 'camunda:class': 'com.foo.ScoreCarDelegate' } }) };
        // A bpmn-js external label shares the host businessObject and points back via labelTarget.
        const label = { id: 'Task_label', labelTarget: host, businessObject: host.businessObject };

        const overlays = fakeOverlays();
        const nav = navigator(overlays, fakeRegistry([host, label]));
        nav.setChangedHandlers(new Map([['class:ScoreCarDelegate', { filePath: 'a.kt', diffType: 'changed' }]]));

        nav.refreshChangedBadges();

        assert.equal(overlays.added.length, 1);
        assert.equal(overlays.added[0].elementId, 'Task');
    });

    it('adds a single badge for a message event with an external label (FEAT-0018 + BUG-0016)', () => {
        const event = {
            id: 'NotifyEnd',
            businessObject: bo({ eventDefinitions: [msgDef({ attrs: { 'camunda:class': 'com.foo.NotifyDelegate' } })] })
        };
        const label = { id: 'NotifyEnd_label', labelTarget: event, businessObject: event.businessObject };

        const overlays = fakeOverlays();
        const nav = navigator(overlays, fakeRegistry([event, label]));
        nav.setChangedHandlers(new Map([['class:NotifyDelegate', { filePath: 'a.kt', diffType: 'added' }]]));

        nav.refreshChangedBadges();

        assert.equal(overlays.added.length, 1);
        assert.equal(overlays.added[0].elementId, 'NotifyEnd');
    });

    it('badges two distinct host elements sharing one handler (no false dedup)', () => {
        const a = { id: 'TaskA', businessObject: bo({ attrs: { 'camunda:class': 'Foo' } }) };
        const b = { id: 'TaskB', businessObject: bo({ attrs: { 'camunda:class': 'Foo' } }) };

        const overlays = fakeOverlays();
        const nav = navigator(overlays, fakeRegistry([a, b]));
        nav.setChangedHandlers(new Map([['class:Foo', { filePath: 'a.kt', diffType: 'changed' }]]));

        nav.refreshChangedBadges();

        assert.deepEqual(overlays.added.map(o => o.elementId), ['TaskA', 'TaskB']);
    });

    // The caller clears the badges by handing over whatever the lookup produced,
    // which is nothing when there is no MR to compare against.
    it('adds nothing when the changed handlers are absent altogether', () => {
        const host = { id: 'Task', businessObject: bo({ attrs: { 'camunda:class': 'Foo' } }) };
        const overlays = fakeOverlays();
        const nav = navigator(overlays, fakeRegistry([host]));
        nav.setChangedHandlers(null);

        nav.refreshChangedBadges();

        assert.equal(overlays.added.length, 0);
    });

    it('adds nothing when no handler is changed', () => {
        const host = { id: 'Task', businessObject: bo({ attrs: { 'camunda:class': 'Foo' } }) };
        const overlays = fakeOverlays();
        const nav = navigator(overlays, fakeRegistry([host]));
        nav.setChangedHandlers(new Map());

        nav.refreshChangedBadges();

        assert.equal(overlays.added.length, 0);
    });
});
