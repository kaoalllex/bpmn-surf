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

    it('names the change in the platform\'s own term', () => {
        const host = { id: 'Task', businessObject: bo({ attrs: { 'camunda:class': 'Foo' } }) };
        const overlays = fakeOverlays();
        const nav = new HandlerNavigator(overlays, fakeRegistry([host]), null, null, () => null, () => null,
            () => null, () => false, undefined, 'PR');
        nav.setChangedHandlers(new Map([['class:Foo', { filePath: 'a.kt', diffType: 'added' }]]));

        nav.refreshChangedBadges();

        assert.match(overlays.added[0].opts.html, /title="Handler added in this PR — open its diff"/);
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

describe('HandlerNavigator — listener badges (FEAT-0019)', () => {
    let HandlerNavigator;

    beforeEach(() => {
        ({ HandlerNavigator } = createScope());
    });

    const listener = (type, props) => ({ $type: `camunda:${type}`, ...props });
    // A BO with Camunda 7 listeners in its extensionElements and no implementation.
    const withListeners = (...values) => ({ extensionElements: { values }, get: () => undefined });
    const ROOT = { id: 'Process_1', type: 'bpmn:Process', businessObject: withListeners() };
    const shape = (id, businessObject, extra = {}) => ({ id, type: 'bpmn:Task', parent: ROOT, businessObject, ...extra });
    const changed = (...keys) => new Map(keys.map(key => [key, { filePath: `${key.slice(6)}.kt`, diffType: 'changed' }]));

    function navigator(overlays, elements, { selected = null, locator = null, opened = [], navigated = [], changeTerm } = {}) {
        return new HandlerNavigator(overlays, fakeRegistry(elements), locator, '7', () => selected, () => 'ref',
            (url) => { opened.push(url); return null; }, (url) => { navigated.push(url); return true; }, undefined, changeTerm);
    }

    const badgesOf = (overlay) => Array.from(overlay.opts.html.children);
    const titles = (overlay) => badgesOf(overlay).map(badge => badge.title);

    it('gives each listener its own badge captioned by its event, even two of one class, and skips an expression listener', () => {
        const task = shape('Task', withListeners(
            listener('ExecutionListener', { event: 'start', class: 'com.a.AuditDelegate' }),
            listener('ExecutionListener', { event: 'end', class: 'com.b.AuditDelegate' }),
            listener('ExecutionListener', { event: 'start', expression: '${audit.log(execution)}' })));
        const overlays = fakeOverlays();
        navigator(overlays, [task], { selected: 'Task' }).showOverlayForSelectedElement();

        assert.equal(overlays.added.length, 1);
        assert.equal(overlays.added[0].elementId, 'Task');
        assert.deepEqual(titles(overlays.added[0]),
            ['Execution listener (start) — open the handler code', 'Execution listener (end) — open the handler code']);
        assert.deepEqual(badgesOf(overlays.added[0]).map(badge => badge.textContent), ['start </>', 'end </>']);
        assert.equal(badgesOf(overlays.added[0])[0].firstChild.className, 'handler-link-event');
        assert.equal(overlays.added[0].opts.html.className, 'listener-links');
        assert.deepEqual({ ...overlays.added[0].opts.position }, { bottom: 0, left: 0 });
    });

    it('adds no row for an element whose listeners are all expressions', () => {
        const task = shape('Task', withListeners(
            listener('ExecutionListener', { event: 'start', expression: '${audit.log(execution)}' })));
        const overlays = fakeOverlays();
        navigator(overlays, [task], { selected: 'Task' }).showOverlayForSelectedElement();

        assert.equal(overlays.added.length, 0);
    });

    it('makes the row permanent when one listener is changed, colouring only that badge', () => {
        const task = shape('Task', withListeners(
            listener('ExecutionListener', { event: 'start', class: 'AuditDelegate' }),
            listener('TaskListener', { event: 'create', class: 'AssignDelegate' })));
        const overlays = fakeOverlays();
        const nav = navigator(overlays, [task], { selected: 'Task' });
        nav.setChangedHandlers(changed('class:AuditDelegate'));

        nav.refreshChangedBadges();
        assert.equal(overlays.added.length, 1);
        const [audit, assign] = badgesOf(overlays.added[0]);
        assert.equal(audit.className, 'handler-link handler-link-listener handler-link-changed');
        assert.equal(audit.title, 'Execution listener (start) changed in this MR — open its diff');
        assert.equal(assign.className, 'handler-link handler-link-listener');
        assert.equal(assign.title, 'Task listener (create) — open the handler code');

        // Already permanent: selecting the element adds no second row.
        nav.showOverlayForSelectedElement();
        assert.equal(overlays.added.length, 1);
    });

    it('names the change in the platform\'s own term', () => {
        const task = shape('Task', withListeners(listener('ExecutionListener', { event: 'start', class: 'AuditDelegate' })));
        const overlays = fakeOverlays();
        const nav = navigator(overlays, [task], { changeTerm: 'PR' });
        nav.setChangedHandlers(changed('class:AuditDelegate'));

        nav.refreshChangedBadges();
        assert.deepEqual(titles(overlays.added[0]), ['Execution listener (start) changed in this PR — open its diff']);
    });

    it('shows the row only on selection when no listener is changed', () => {
        const task = shape('Task', withListeners(listener('ExecutionListener', { event: 'start', class: 'AuditDelegate' })));
        const overlays = fakeOverlays();
        const nav = navigator(overlays, [task], { selected: 'Task' });
        nav.setChangedHandlers(changed('class:OtherDelegate'));

        nav.refreshChangedBadges();
        assert.equal(overlays.added.length, 0);

        nav.showOverlayForSelectedElement();
        assert.equal(overlays.added.length, 1);
    });

    it('gives a task changed both as implementation and as listener one badge of each, both coloured', () => {
        const businessObject = withListeners(listener('ExecutionListener', { event: 'end', class: 'AuditDelegate' }));
        businessObject.get = (name) => (name === 'camunda:class' ? 'com.a.AuditDelegate' : undefined);
        const overlays = fakeOverlays();
        const nav = navigator(overlays, [shape('Task', businessObject)]);
        nav.setChangedHandlers(changed('class:AuditDelegate'));

        nav.refreshChangedBadges();

        assert.equal(overlays.added.length, 2);
        assert.match(overlays.added[0].opts.html, /class="handler-link handler-link-changed"/);
        assert.equal(badgesOf(overlays.added[1])[0].className, 'handler-link handler-link-listener handler-link-changed');
    });

    it('reads a pool\'s listeners from its process', () => {
        const pool = shape('Pool', { processRef: withListeners(listener('ExecutionListener', { event: 'start', class: 'AuditDelegate' })) },
            { type: 'bpmn:Participant' });
        const overlays = fakeOverlays();
        navigator(overlays, [pool], { selected: 'Pool' }).showOverlayForSelectedElement();

        assert.deepEqual(titles(overlays.added[0]), ['Execution listener (start) — open the handler code']);
    });

    it('puts the process listeners of a pool-less process on its top-level start event', () => {
        const root = { ...ROOT, businessObject: withListeners(listener('ExecutionListener', { event: 'end', class: 'ProcessAudit' })) };
        const start = { id: 'Start', type: 'bpmn:StartEvent', parent: root, businessObject: withListeners() };
        const subProcess = { id: 'Sub', type: 'bpmn:SubProcess', parent: root, businessObject: withListeners() };
        const nestedStart = { id: 'NestedStart', type: 'bpmn:StartEvent', parent: subProcess, businessObject: withListeners() };
        const overlays = fakeOverlays();
        const nav = navigator(overlays, [start, nestedStart]);
        nav.setChangedHandlers(changed('class:ProcessAudit'));

        nav.refreshChangedBadges();

        assert.deepEqual(overlays.added.map(overlay => overlay.elementId), ['Start']);
        assert.deepEqual(titles(overlays.added[0]), ['Process execution listener (end) changed in this MR — open its diff']);
        assert.equal(badgesOf(overlays.added[0])[0].textContent, 'process end </>');
    });

    it('does not lift the process listeners onto a start event inside a pool', () => {
        const pool = { id: 'Pool', type: 'bpmn:Participant', parent: { id: 'Collab', type: 'bpmn:Collaboration' } };
        pool.businessObject = { processRef: withListeners(listener('ExecutionListener', { event: 'end', class: 'ProcessAudit' })) };
        const start = { id: 'Start', type: 'bpmn:StartEvent', parent: pool, businessObject: withListeners() };
        const overlays = fakeOverlays();
        const nav = navigator(overlays, [pool, start]);
        nav.setChangedHandlers(changed('class:ProcessAudit'));

        nav.refreshChangedBadges();

        assert.deepEqual(overlays.added.map(overlay => overlay.elementId), ['Pool']);
    });

    it('sits a flow\'s row at the middle of its middle segment', () => {
        const flow = shape('Flow', withListeners(listener('ExecutionListener', { event: 'take', delegateExpression: '${stepTimer}' })), {
            type: 'bpmn:SequenceFlow',
            waypoints: [{ x: 10, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 120 }, { x: 210, y: 120 }]
        });
        const overlays = fakeOverlays();
        navigator(overlays, [flow], { selected: 'Flow' }).showOverlayForSelectedElement();

        assert.equal(overlays.added[0].opts.html.className, 'listener-links listener-links-flow');
        assert.deepEqual({ ...overlays.added[0].opts.position }, { left: 100, top: 50 });
        assert.deepEqual(titles(overlays.added[0]), ['Execution listener (take) — open the handler code']);
    });

    it('adds nothing for the root element, which has no shape', () => {
        const overlays = fakeOverlays();
        const root = { ...ROOT, businessObject: withListeners(listener('ExecutionListener', { event: 'end', class: 'ProcessAudit' })) };
        navigator(overlays, [root], { selected: 'Process_1' }).showOverlayForSelectedElement();

        assert.equal(overlays.added.length, 0);
    });

    it('opens the MR diff of a changed listener in the opener tab', async () => {
        const task = shape('Task', withListeners(listener('ExecutionListener', { event: 'start', class: 'AuditDelegate' })));
        const overlays = fakeOverlays();
        const opened = [];
        const navigated = [];
        const locator = { mrFileDiffUrl: (filePath, mrIid) => `diff/${mrIid}/${filePath}` };
        const nav = navigator(overlays, [task], { locator, opened, navigated });
        nav.setChangedHandlers(changed('class:AuditDelegate'));
        nav.refreshChangedBadges();

        badgesOf(overlays.added[0])[0].click();
        await new Promise(resolve => setImmediate(resolve));

        assert.deepEqual(navigated, ['diff/7/AuditDelegate.kt']);
        assert.deepEqual(opened, []);
    });
});
