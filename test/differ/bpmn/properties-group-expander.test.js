'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

// ---- Axis B: the pure relevantGroupsForElement mapping --------------------
// Pure (no DOM), so one shared scope is enough for the whole block.
const { PropertiesGroupExpander } = createScope();

// Sorts into a plain host array so cross-realm assert.deepEqual is reliable.
function groupsOf(element) {
    return [...PropertiesGroupExpander.relevantGroupsForElement(element)].sort();
}

// A fake business object whose properties are read via get() — mirrors how real
// moddle objects expose them (and the #read accessor must handle both forms).
function moddleBo(fields) {
    return { get: (name) => fields[name] };
}

describe('PropertiesGroupExpander.relevantGroupsForElement — Condition', () => {
    it('a sequence flow leaving a gateway → Condition', () => {
        assert.deepEqual(groupsOf({
            type: 'bpmn:SequenceFlow',
            source: { type: 'bpmn:ExclusiveGateway' },
            businessObject: {}
        }), ['Condition']);
    });

    it('a sequence flow leaving an inclusive gateway → Condition', () => {
        assert.deepEqual(groupsOf({
            type: 'bpmn:SequenceFlow',
            source: { type: 'bpmn:InclusiveGateway' },
            businessObject: {}
        }), ['Condition']);
    });

    it('a sequence flow NOT leaving a gateway → no Condition', () => {
        assert.deepEqual(groupsOf({
            type: 'bpmn:SequenceFlow',
            source: { type: 'bpmn:Task' },
            businessObject: {}
        }), []);
    });

    it('a sequence flow with no source → no Condition', () => {
        assert.deepEqual(groupsOf({
            type: 'bpmn:SequenceFlow',
            businessObject: {}
        }), []);
    });

    it('a conditional boundary event → Condition (keyed on the event definition)', () => {
        assert.deepEqual(groupsOf({
            type: 'bpmn:BoundaryEvent',
            businessObject: { eventDefinitions: [{ $type: 'bpmn:ConditionalEventDefinition' }] }
        }), ['Condition']);
    });
});

describe('PropertiesGroupExpander.relevantGroupsForElement — Message', () => {
    it('a ReceiveTask → Message', () => {
        assert.deepEqual(groupsOf({ type: 'bpmn:ReceiveTask', businessObject: {} }), ['Message']);
    });

    it('a message intermediate catch event → Message', () => {
        assert.deepEqual(groupsOf({
            type: 'bpmn:IntermediateCatchEvent',
            businessObject: { eventDefinitions: [{ $type: 'bpmn:MessageEventDefinition' }] }
        }), ['Message']);
    });

    it('a message boundary event → Message (boundary not enumerated, keyed on definition)', () => {
        assert.deepEqual(groupsOf({
            type: 'bpmn:BoundaryEvent',
            businessObject: { eventDefinitions: [{ $type: 'bpmn:MessageEventDefinition' }] }
        }), ['Message']);
    });

    it('a message throw event → Message (throw carries the same group)', () => {
        assert.deepEqual(groupsOf({
            type: 'bpmn:IntermediateThrowEvent',
            businessObject: { eventDefinitions: [{ $type: 'bpmn:MessageEventDefinition' }] }
        }), ['Message']);
    });
});

describe('PropertiesGroupExpander.relevantGroupsForElement — Timer/Error/Escalation', () => {
    it('a timer boundary event → Timer', () => {
        assert.deepEqual(groupsOf({
            type: 'bpmn:BoundaryEvent',
            businessObject: { eventDefinitions: [{ $type: 'bpmn:TimerEventDefinition' }] }
        }), ['Timer']);
    });

    it('an error boundary event → Error', () => {
        assert.deepEqual(groupsOf({
            type: 'bpmn:BoundaryEvent',
            businessObject: { eventDefinitions: [{ $type: 'bpmn:ErrorEventDefinition' }] }
        }), ['Error']);
    });

    it('an escalation boundary event → Escalation', () => {
        assert.deepEqual(groupsOf({
            type: 'bpmn:BoundaryEvent',
            businessObject: { eventDefinitions: [{ $type: 'bpmn:EscalationEventDefinition' }] }
        }), ['Escalation']);
    });

    it('reads event definitions via the moddle get() accessor too', () => {
        assert.deepEqual(groupsOf({
            type: 'bpmn:BoundaryEvent',
            businessObject: moddleBo({ eventDefinitions: [{ $type: 'bpmn:TimerEventDefinition' }] })
        }), ['Timer']);
    });
});

describe('PropertiesGroupExpander.relevantGroupsForElement — Implementation', () => {
    for (const type of ['bpmn:ServiceTask', 'bpmn:SendTask', 'bpmn:ScriptTask', 'bpmn:BusinessRuleTask']) {
        it(`${type} → Implementation`, () => {
            assert.deepEqual(groupsOf({ type, businessObject: {} }), ['Implementation']);
        });
    }
});

describe('PropertiesGroupExpander.relevantGroupsForElement — Forms / Multi-instance', () => {
    it('a UserTask → Forms', () => {
        assert.deepEqual(groupsOf({ type: 'bpmn:UserTask', businessObject: {} }), ['Forms']);
    });

    it('an element carrying multi-instance loop characteristics → Multi-instance', () => {
        assert.deepEqual(groupsOf({
            type: 'bpmn:CallActivity',
            businessObject: { loopCharacteristics: { $type: 'bpmn:MultiInstanceLoopCharacteristics' } }
        }), ['Multi-instance']);
    });

    it('a standard (non-multi-instance) loop → no Multi-instance', () => {
        assert.deepEqual(groupsOf({
            type: 'bpmn:Task',
            businessObject: { loopCharacteristics: { $type: 'bpmn:StandardLoopCharacteristics' } }
        }), []);
    });
});

describe('PropertiesGroupExpander.relevantGroupsForElement — list groups', () => {
    function withExtensions(type, values) {
        return { type, businessObject: { extensionElements: { values } } };
    }

    it('≥1 camunda:In → In mappings', () => {
        assert.deepEqual(groupsOf(withExtensions('bpmn:CallActivity', [{ $type: 'camunda:In' }])), ['In mappings']);
    });

    it('≥1 camunda:Out → Out mappings', () => {
        assert.deepEqual(groupsOf(withExtensions('bpmn:CallActivity', [{ $type: 'camunda:Out' }])), ['Out mappings']);
    });

    it('a non-empty inputParameters list → Inputs', () => {
        assert.deepEqual(groupsOf(withExtensions('bpmn:ServiceTask', [
            { $type: 'camunda:InputOutput', inputParameters: [{}], outputParameters: [] }
        ])), ['Implementation', 'Inputs']);
    });

    it('a non-empty outputParameters list → Outputs', () => {
        assert.deepEqual(groupsOf(withExtensions('bpmn:Task', [
            { $type: 'camunda:InputOutput', inputParameters: [], outputParameters: [{}] }
        ])), ['Outputs']);
    });

    it('an empty InputOutput → neither Inputs nor Outputs', () => {
        assert.deepEqual(groupsOf(withExtensions('bpmn:Task', [
            { $type: 'camunda:InputOutput', inputParameters: [], outputParameters: [] }
        ])), []);
    });

    it('reads extensionElements via the moddle get() accessor too', () => {
        assert.deepEqual(groupsOf({
            type: 'bpmn:CallActivity',
            businessObject: moddleBo({ extensionElements: moddleBo({ values: [{ $type: 'camunda:In' }] }) })
        }), ['In mappings']);
    });
});

describe('PropertiesGroupExpander.relevantGroupsForElement — non-matches & combinations', () => {
    it('a CallActivity does NOT yield "Called element"', () => {
        const groups = groupsOf({
            type: 'bpmn:CallActivity',
            businessObject: { calledElement: 'someProcess' }
        });
        assert.ok(!groups.includes('Called element'));
        assert.deepEqual(groups, []);
    });

    it('a plain task → []', () => {
        assert.deepEqual(groupsOf({ type: 'bpmn:Task', businessObject: {} }), []);
    });

    it('a null element → []', () => {
        assert.deepEqual(groupsOf(null), []);
    });

    it('combines axis-B groups of one element (multi-instance ServiceTask with inputs)', () => {
        assert.deepEqual(groupsOf({
            type: 'bpmn:ServiceTask',
            businessObject: {
                loopCharacteristics: { $type: 'bpmn:MultiInstanceLoopCharacteristics' },
                extensionElements: { values: [{ $type: 'camunda:InputOutput', inputParameters: [{}], outputParameters: [] }] }
            }
        }), ['Implementation', 'Inputs', 'Multi-instance']);
    });
});

// ---- DOM logic: expandRelevantGroups against a fake panel ------------------

// Builds a minimal properties panel; each group's header carries the `open`
// class exactly as the real panel marks an expanded group. Returns the header
// elements keyed by title, each instrumented with a click counter.
function buildPanel(scope, groups) {
    const panel = scope.document.createElement('div');
    panel.className = 'bio-properties-panel';
    const headers = {};
    for (const { title, open } of groups) {
        const group = scope.document.createElement('div');
        group.className = 'bio-properties-panel-group';

        const header = scope.document.createElement('div');
        header.className = 'bio-properties-panel-group-header' + (open ? ' open' : '');
        header.clicks = 0;
        header.addEventListener('click', () => { header.clicks++; });

        const titleEl = scope.document.createElement('div');
        titleEl.className = 'bio-properties-panel-group-header-title';
        titleEl.textContent = title;

        header.appendChild(titleEl);
        group.appendChild(header);
        panel.appendChild(group);
        headers[title] = header;
    }
    scope.document.body.appendChild(panel);
    return headers;
}

function expanderWith(scope, { element = null, diffMap = new Map() } = {}) {
    const expander = new scope.PropertiesGroupExpander();
    expander.init({ get: () => element });
    expander.setDiffData(diffMap);
    return expander;
}

describe('PropertiesGroupExpander.expandRelevantGroups — DOM', () => {
    it('clicks a collapsed relevant group open', async () => {
        const scope = createScope();
        const headers = buildPanel(scope, [{ title: 'Forms', open: false }]);
        const expander = expanderWith(scope, { element: { type: 'bpmn:UserTask', businessObject: {} } });

        await expander.expandRelevantGroups('UserTask_1');

        assert.equal(headers['Forms'].clicks, 1);
    });

    it('leaves an already-open group untouched', async () => {
        const scope = createScope();
        const headers = buildPanel(scope, [{ title: 'Forms', open: true }]);
        const expander = expanderWith(scope, { element: { type: 'bpmn:UserTask', businessObject: {} } });

        await expander.expandRelevantGroups('UserTask_1');

        assert.equal(headers['Forms'].clicks, 0);
    });

    it('is a silent no-op when the relevant group is absent from the panel', async () => {
        const scope = createScope();
        const headers = buildPanel(scope, [{ title: 'General', open: false }]);
        const expander = expanderWith(scope, { element: { type: 'bpmn:UserTask', businessObject: {} } });

        await expander.expandRelevantGroups('UserTask_1');

        // Forms is not in the panel; General (an unrelated group) is left alone.
        assert.equal(headers['General'].clicks, 0);
    });

    it('expands the deduped union of axis A (diff) and axis B (type), clicking a shared group once', async () => {
        const scope = createScope();
        const headers = buildPanel(scope, [
            { title: 'Implementation', open: false },
            { title: 'Asynchronous continuations', open: false }
        ]);
        const expander = expanderWith(scope, {
            // axis B (ServiceTask) → Implementation; axis A (diff) → the same plus async
            element: { type: 'bpmn:ServiceTask', businessObject: {} },
            diffMap: new Map([['ServiceTask_1', ['Implementation', 'Asynchronous continuations']]])
        });

        await expander.expandRelevantGroups('ServiceTask_1');

        assert.equal(headers['Implementation'].clicks, 1);
        assert.equal(headers['Asynchronous continuations'].clicks, 1);
    });

    it('expands an element only once — a re-selection (e.g. Switch branch) does not re-expand', async () => {
        const scope = createScope();
        const headers = buildPanel(scope, [{ title: 'Forms', open: false }]);
        const expander = expanderWith(scope, { element: { type: 'bpmn:UserTask', businessObject: {} } });

        await expander.expandRelevantGroups('UserTask_1');
        assert.equal(headers['Forms'].clicks, 1);

        // The user collapses the group, then triggers a re-selection of the same
        // element (Switch branch re-imports and re-selects). It must stay collapsed.
        headers['Forms'].classList.remove('open');
        await expander.expandRelevantGroups('UserTask_1');
        assert.equal(headers['Forms'].clicks, 1);
    });

    it('still auto-expands a different element after one was already expanded', async () => {
        const scope = createScope();
        const headers = buildPanel(scope, [
            { title: 'Forms', open: false },
            { title: 'Implementation', open: false }
        ]);
        const elements = {
            UserTask_1: { type: 'bpmn:UserTask', businessObject: {} },
            ServiceTask_1: { type: 'bpmn:ServiceTask', businessObject: {} }
        };
        const expander = new scope.PropertiesGroupExpander();
        expander.init({ get: (id) => elements[id] });
        expander.setDiffData(new Map());

        await expander.expandRelevantGroups('UserTask_1');
        await expander.expandRelevantGroups('ServiceTask_1');

        assert.equal(headers['Forms'].clicks, 1);
        assert.equal(headers['Implementation'].clicks, 1);
    });

    it('expands an axis-A changed group even with no axis-B match', async () => {
        const scope = createScope();
        const headers = buildPanel(scope, [{ title: 'Documentation', open: false }]);
        const expander = expanderWith(scope, {
            element: { type: 'bpmn:Task', businessObject: {} },
            diffMap: new Map([['Task_1', ['Documentation']]])
        });

        await expander.expandRelevantGroups('Task_1');

        assert.equal(headers['Documentation'].clicks, 1);
    });
});
