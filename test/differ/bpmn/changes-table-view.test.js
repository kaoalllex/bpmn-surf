'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createScope } = require('#scope');

const { ChangesTableView } = createScope();

const FONT_CSS = fs.readFileSync(
    path.join(__dirname, '../../../libs/bpmn-js/assets/bpmn-font/css/bpmn.css'), 'utf8');

const shape = (type, props = {}, elemProps = {}) =>
    ({ businessObject: { $type: `bpmn:${type}`, ...props }, ...elemProps });
const definition = (name) => ({ $type: `bpmn:${name}EventDefinition` });

describe('ChangesTableView.iconClass', () => {
    const cases = [
        [shape('Task'), 'bpmn-icon-task'],
        [shape('ServiceTask'), 'bpmn-icon-service-task'],
        [shape('BusinessRuleTask'), 'bpmn-icon-business-rule-task'],
        [shape('CallActivity'), 'bpmn-icon-call-activity'],
        [shape('ExclusiveGateway'), 'bpmn-icon-gateway-xor'],
        [shape('EventBasedGateway'), 'bpmn-icon-gateway-eventbased'],
        [shape('SubProcess', {}, { collapsed: true }), 'bpmn-icon-subprocess-collapsed'],
        [shape('SubProcess', { triggeredByEvent: true }), 'bpmn-icon-event-subprocess-expanded'],
        [shape('StartEvent'), 'bpmn-icon-start-event-none'],
        [shape('StartEvent', { isInterrupting: false, eventDefinitions: [definition('Message')] }),
            'bpmn-icon-start-event-non-interrupting-message'],
        [shape('EndEvent', { eventDefinitions: [definition('Terminate')] }), 'bpmn-icon-end-event-terminate'],
        [shape('IntermediateThrowEvent'), 'bpmn-icon-intermediate-event-none'],
        [shape('IntermediateCatchEvent', { eventDefinitions: [definition('Conditional')] }),
            'bpmn-icon-intermediate-event-catch-condition'],
        [shape('BoundaryEvent', { cancelActivity: false, eventDefinitions: [definition('Timer')] }),
            'bpmn-icon-intermediate-event-catch-non-interrupting-timer'],
        [shape('EndEvent', { eventDefinitions: [definition('Compensate')] }), 'bpmn-icon-end-event-compensation'],
        [shape('BoundaryEvent', { eventDefinitions: [definition('Error'), definition('Signal')] }),
            'bpmn-icon-intermediate-event-catch-multiple'],
        [shape('SequenceFlow'), 'bpmn-icon-connection'],
        [shape('SequenceFlow', { conditionExpression: {} }), 'bpmn-icon-conditional-flow'],
        [shape('DataStoreReference'), 'bpmn-icon-data-store'],
        [shape('TextAnnotation'), 'bpmn-icon-text-annotation']
    ];

    for (const [elem, expected] of cases) {
        it(`${elem.businessObject.$type} → ${expected}, a class bpmn-font defines`, () => {
            assert.equal(ChangesTableView.iconClass(elem), expected);
            assert.ok(FONT_CSS.includes(`.${expected}:before`), `bpmn.css has no ${expected}`);
        });
    }

    it('marks the default flow of its source', () => {
        const flow = { $type: 'bpmn:SequenceFlow', conditionExpression: {} };
        flow.sourceRef = { default: flow };
        assert.equal(ChangesTableView.iconClass({ businessObject: flow }), 'bpmn-icon-default-flow');
    });
});

describe('ChangesTableView.whatChanged', () => {
    it('lists the changed groups once each, the type first', () => {
        const map = new Map([['Task_1', ['Implementation', 'Inputs', 'Implementation']]]);
        assert.equal(ChangesTableView.whatChanged('Task_1', map, ['Task_1']), 'Type, Implementation, Inputs');
    });

    it('is empty for an element with no named change', () => {
        assert.equal(ChangesTableView.whatChanged('Task_1', new Map(), []), '');
    });
});

describe('ChangesTableView.insideText', () => {
    it('counts the changes inside a collapsed subprocess', () => {
        assert.equal(ChangesTableView.insideText(0), '');
        assert.equal(ChangesTableView.insideText(1), '1 change inside');
        assert.equal(ChangesTableView.insideText(3), '3 changes inside');
    });
});
