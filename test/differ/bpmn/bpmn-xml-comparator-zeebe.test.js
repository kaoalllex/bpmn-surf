'use strict';

// Property-group mapping of BpmnXmlComparator on Camunda 8 (zeebe:*) constructs
// (fixture: zeebe-base.bpmn). One test = one change, built as a single string
// replacement of the base. The group names are the Zeebe properties panel's.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope, fixture } = require('#scope');

const { BpmnXmlComparator } = createScope();

const base = fixture('zeebe-base.bpmn');

// Builds a one-change variant of zeebe-base.bpmn.
// Throws if the anchor is gone or ambiguous, so a fixture edit fails loudly here, not in asserts.
function variant(oldString, newString) {
    if (!base.includes(oldString)) {
        throw new Error(`zeebe-base.bpmn does not contain the anchor: ${oldString}`);
    }
    if (base.indexOf(oldString) !== base.lastIndexOf(oldString)) {
        throw new Error(`zeebe-base.bpmn contains the anchor more than once: ${oldString}`);
    }
    return base.replace(oldString, newString);
}

function compare(myXml, otherXml) {
    return new BpmnXmlComparator().compare(myXml, otherXml);
}

function mappingChangesToObject(map) {
    const obj = {};
    for (const [id, groupMap] of map) {
        obj[id] = {};
        for (const [group, descriptors] of groupMap) {
            obj[id][group] = Array.from(descriptors, d => ({ label: d.label, changed: d.changed }));
        }
    }
    return obj;
}

function assertNoDiffs(result) {
    assert.deepEqual(Array.from(result.missingShapeIds), []);
    assert.deepEqual(Array.from(result.missingRowIds), []);
    assert.deepEqual(Array.from(result.changedShapeIds), []);
    assert.deepEqual(Array.from(result.changedRowIds), []);
    assert.equal(result.nodeIdToDiffsMap.size, 0);
}

describe('BpmnXmlComparator zeebe fixture sanity', () => {
    it('finds no diffs for identical documents', () => {
        assertNoDiffs(compare(base, base));
    });
});

describe('BpmnXmlComparator zeebe property groups', () => {
    const cases = [
        ['ServiceTask_1', 'type="validate-order" retries="3" />', 'type="validate-order" retries="5" />', 'Task definition'],
        ['ServiceTask_1', 'type="validate-order"', 'type="validate-order-v2"', 'Task definition'],
        ['ServiceTask_2', '<zeebe:taskDefinition type="notify" />',
            '<zeebe:taskDefinition type="notify" /><zeebe:taskHeaders><zeebe:header key="k" value="v" /></zeebe:taskHeaders>',
            'Headers'],
        ['ServiceTask_3', 'priority="10"', 'priority="20"', 'Job priority'],
        ['ServiceTask_1', 'source="=orderId"', 'source="=order.id"', 'Input mapping'],
        ['ServiceTask_1', '<zeebe:output source="=valid" target="valid" />',
            '<zeebe:output source="=valid" target="valid" /><zeebe:output source="=x" target="x" />', 'Output mapping'],
        ['ServiceTask_1', 'value="order-completed"', 'value="other"', 'Headers'],
        ['ServiceTask_1', 'value="team-a"', 'value="team-b"', 'Extension properties'],
        // the bare `name` row (General) must not win over the element's own row
        ['ServiceTask_1', 'name="owner"', 'name="owner2"', 'Extension properties'],
        ['ServiceTask_1', 'type="audit-step"', 'type="audit-order-step"', 'Execution listeners'],
        ['CallActivity_1', 'processId="PaymentC8"', 'processId="PaymentV2C8"', 'Called element'],
        ['CallActivity_1', 'propagateAllChildVariables="false"', 'propagateAllChildVariables="true"', 'Output propagation'],
        ['CallActivity_1', 'propagateAllChildVariables="false" />',
            'propagateAllChildVariables="false" propagateAllParentVariables="false" />', 'Input propagation'],
        ['BusinessRuleTask_1', 'resultVariable="risk"', 'resultVariable="riskLevel"', 'Called decision'],
        ['ScriptTask_1', 'fee, 2)', 'fee * 1.1, 2)', 'Script'],
        ['MultiTask_1', 'inputCollection="=items"', 'inputCollection="=order.items"', 'Multi-instance'],
        // <zeebe:userTask /> is empty, yet its presence is the value (Camunda user task vs job worker)
        ['UserTask_2', '<zeebe:formDefinition formKey="camunda-forms:bpmn:Form_1" />',
            '<zeebe:userTask /><zeebe:formDefinition formKey="camunda-forms:bpmn:Form_1" />', 'Implementation'],
        ['UserTask_1', 'assignee="=logisticsUser"', 'assignee="=dispatcher"', 'Assignment'],
        ['UserTask_1', 'dueDate="=now()"', 'dueDate="=today()"', 'Assignment'],
        ['UserTask_1', 'priority="50"', 'priority="70"', 'Assignment'],
        ['UserTask_1', 'formId="pick-courier"', 'formId="pick-courier-v2"', 'Form'],
        ['UserTask_1', 'type="assign-courier"', 'type="assign-courier-v2"', 'Task listeners']
    ];

    for (const [id, oldString, newString, group] of cases) {
        it(`${id}: ${oldString} -> ${newString} lights up "${group}"`, () => {
            const result = compare(variant(oldString, newString), base);
            assert.deepEqual(Array.from(result.changedShapeIds), [id]);
            assert.deepEqual(Array.from(result.nodeIdToDiffsMap.get(id)), [group]);
        });
    }

    it('a template attribute changes the panel header, not a group', () => {
        const result = compare(variant('zeebe:modelerTemplateVersion="8"', 'zeebe:modelerTemplateVersion="9"'), base);
        assert.deepEqual(Array.from(result.typeChangedIds), ['TemplatedTask_1']);
        assert.equal(result.nodeIdToDiffsMap.has('TemplatedTask_1'), false);
    });
});

describe('BpmnXmlComparator zeebe list-group entries', () => {
    it('marks a changed input mapping by its target', () => {
        const result = compare(variant('source="=orderId"', 'source="=order.id"'), base);
        assert.deepEqual(mappingChangesToObject(result.nodeIdToMappingChanges),
            { ServiceTask_1: { 'Input mapping': [{ label: 'orderId', changed: true }] } });
    });

    it('marks an added output mapping by its target', () => {
        const result = compare(variant('<zeebe:output source="=valid" target="valid" />',
            '<zeebe:output source="=valid" target="valid" /><zeebe:output source="=x" target="x" />'), base);
        assert.deepEqual(mappingChangesToObject(result.nodeIdToMappingChanges),
            { ServiceTask_1: { 'Output mapping': [{ label: 'x', changed: false }] } });
    });

    it('marks an added header by its key', () => {
        const result = compare(variant('<zeebe:header key="template" value="order-completed" />',
            '<zeebe:header key="template" value="order-completed" /><zeebe:header key="channel" value="email" />'), base);
        assert.deepEqual(mappingChangesToObject(result.nodeIdToMappingChanges),
            { ServiceTask_1: { Headers: [{ label: 'channel', changed: false }] } });
    });

    it('marks a changed extension property by its name', () => {
        const result = compare(variant('value="team-a"', 'value="team-b"'), base);
        assert.deepEqual(mappingChangesToObject(result.nodeIdToMappingChanges),
            { ServiceTask_1: { 'Extension properties': [{ label: 'owner', changed: true }] } });
    });
});

describe('BpmnXmlComparator zeebe defaults and empty containers', () => {
    const noChanges = [
        ['stating propagateAllParentVariables="true"', 'propagateAllChildVariables="false" />',
            'propagateAllChildVariables="false" propagateAllParentVariables="true" />'],
        ['stating bindingType="latest"', 'resultVariable="risk" />', 'resultVariable="risk" bindingType="latest" />'],
        ['stating retries="3"', 'type="notify" />', 'type="notify" retries="3" />'],
        ['an empty zeebe:ioMapping', '<zeebe:taskDefinition type="notify" />',
            '<zeebe:taskDefinition type="notify" /><zeebe:ioMapping />'],
        ['an empty zeebe:taskHeaders', '<zeebe:taskDefinition type="notify" />',
            '<zeebe:taskDefinition type="notify" /><zeebe:taskHeaders>\n        </zeebe:taskHeaders>'],
        ['an empty zeebe:properties', '<zeebe:taskDefinition type="notify" />',
            '<zeebe:taskDefinition type="notify" /><zeebe:properties />']
    ];

    for (const [name, oldString, newString] of noChanges) {
        it(`${name} is no change`, () => {
            assertNoDiffs(compare(variant(oldString, newString), base));
        });
    }

    it('retries other than the default is a change', () => {
        const result = compare(variant('type="notify" />', 'type="notify" retries="5" />'), base);
        assert.deepEqual(Array.from(result.nodeIdToDiffsMap.get('ServiceTask_2')), ['Task definition']);
    });
});
