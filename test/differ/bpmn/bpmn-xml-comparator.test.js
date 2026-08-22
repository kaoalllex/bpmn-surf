'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope, fixture, mapToObject } = require('#scope');

const { BpmnXmlComparator } = createScope();

const base = fixture('base.bpmn');
const addedTask = fixture('added-task.bpmn');
const changedName = fixture('changed-name.bpmn');
const changedCondition = fixture('changed-condition.bpmn');
const addedAssociation = fixture('added-association.bpmn');
const reformattedCondition = fixture('reformatted-condition.bpmn');

function withCondition(condition) {
    return base.replace('${approved == true}', condition);
}

function withScriptCondition(script) {
    return base.replace(
        '<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${approved == true}',
        '<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" language="groovy">' + script
    );
}

function compare(myXml, otherXml) {
    return new BpmnXmlComparator().compare(myXml, otherXml);
}

describe('BpmnXmlComparator.compare', () => {
    it('finds no diffs for identical documents', () => {
        const result = compare(base, base);
        assert.deepEqual(Array.from(result.missingShapeIds), []);
        assert.deepEqual(Array.from(result.missingRowIds), []);
        assert.deepEqual(Array.from(result.changedShapeIds), []);
        assert.deepEqual(Array.from(result.changedRowIds), []);
        assert.equal(result.nodeIdToDiffsMap.size, 0);
        assert.equal(result.nodeIdToConditions.size, 0);
    });

    // Replacing an element's type stops the node walk at the tag mismatch, so it names
    // no property: without typeChangedIds the element is blue and nothing says why.
    it('reports an element whose type was replaced', () => {
        const asServiceTask = base.replace(/bpmn:userTask/g, 'bpmn:serviceTask');
        const result = compare(asServiceTask, base);
        assert.deepEqual(Array.from(result.typeChangedIds), ['Task_1']);
        assert.deepEqual(Array.from(result.changedShapeIds), ['Task_1']);
    });

    it('reports no type change when only a property differs', () => {
        assert.deepEqual(Array.from(compare(changedName, base).typeChangedIds), []);
        assert.deepEqual(Array.from(compare(base, base).typeChangedIds), []);
    });

    // The properties panel creates camunda:inputOutput when a list group gets its first
    // entry and leaves the empty container behind when the last entry is deleted, so an
    // add-then-delete round trip would otherwise keep the element painted as changed.
    it('ignores an extension container left empty', () => {
        const withEmptyContainer = base.replace(
            '<bpmn:incoming>Flow_1</bpmn:incoming>',
            '<bpmn:extensionElements><camunda:inputOutput /></bpmn:extensionElements>'
                + '<bpmn:incoming>Flow_1</bpmn:incoming>');
        assert.deepEqual(Array.from(compare(withEmptyContainer, base).changedShapeIds), []);
        assert.deepEqual(Array.from(compare(base, withEmptyContainer).changedShapeIds), []);
    });

    it('still reports a container that holds an entry', () => {
        const withInput = base.replace(
            '<bpmn:incoming>Flow_1</bpmn:incoming>',
            '<bpmn:extensionElements><camunda:inputOutput>'
                + '<camunda:inputParameter name="in1">1</camunda:inputParameter>'
                + '</camunda:inputOutput></bpmn:extensionElements>'
                + '<bpmn:incoming>Flow_1</bpmn:incoming>');
        const result = compare(withInput, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['Task_1']);
        assert.deepEqual(Array.from(result.nodeIdToDiffsMap.get('Task_1')), ['Inputs']);
    });

    it('returns the executable process node', () => {
        const result = compare(base, base);
        assert.equal(result.processNode.getAttribute('id'), 'Process_1');
    });

    it('detects added shape and added sequence flow as missing in the other version', () => {
        const result = compare(addedTask, base);
        assert.deepEqual(Array.from(result.missingShapeIds), ['Task_2']);
        assert.deepEqual(Array.from(result.missingRowIds), ['Flow_3']);
        assert.deepEqual(Array.from(result.changedShapeIds), []);
        assert.deepEqual(Array.from(result.changedRowIds), []);
    });

    it('ignores incoming/outgoing connector changes (reverse direction is clean)', () => {
        const result = compare(base, addedTask);
        assert.deepEqual(Array.from(result.missingShapeIds), []);
        assert.deepEqual(Array.from(result.missingRowIds), []);
        assert.deepEqual(Array.from(result.changedShapeIds), []);
        assert.deepEqual(Array.from(result.changedRowIds), []);
    });

    it('classifies an added association as a missing row, not a shape', () => {
        const result = compare(addedAssociation, base);
        assert.deepEqual(Array.from(result.missingShapeIds), ['TextAnnotation_1']);
        assert.deepEqual(Array.from(result.missingRowIds), ['Association_1']);
    });

    it('detects changed task name and maps it to the General property group', () => {
        const result = compare(changedName, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['Task_1']);
        assert.deepEqual(Array.from(result.changedRowIds), []);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { Task_1: ['General'] });
    });

    it('detects changed sequence flow condition with both condition texts', () => {
        const result = compare(changedCondition, base);
        assert.deepEqual(Array.from(result.changedRowIds), ['Flow_2']);
        assert.deepEqual(Array.from(result.changedShapeIds), []);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { Flow_2: ['Condition'] });
        assert.deepEqual(mapToObject(result.nodeIdToConditions), {
            Flow_2: ['${approved == false}', '${approved == true}']
        });
    });
});

// bpmn-js writes both forms — saveXML() compact, saveXML({format:true}) indented —
// and a repository file can be reindented by any editor. Indentation is not a change.
const compact = (xml) => xml.replace(/>\s+</g, '><');

describe('BpmnXmlComparator document indentation', () => {
    it('finds no diffs between a compact document and its indented twin', () => {
        const result = compare(compact(base), base);
        assert.deepEqual(Array.from(result.missingShapeIds), []);
        assert.deepEqual(Array.from(result.missingRowIds), []);
        assert.deepEqual(Array.from(result.changedShapeIds), []);
        assert.deepEqual(Array.from(result.changedRowIds), []);
        assert.equal(result.nodeIdToDiffsMap.size, 0);
    });

    it('still detects a real change between differently indented documents', () => {
        const result = compare(compact(changedName), base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['Task_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { Task_1: ['General'] });
    });

    it('records both condition texts in compact documents', () => {
        const result = compare(compact(changedCondition), compact(base));
        assert.deepEqual(Array.from(result.changedRowIds), ['Flow_2']);
        assert.deepEqual(mapToObject(result.nodeIdToConditions), {
            Flow_2: ['${approved == false}', '${approved == true}']
        });
    });
});

describe('BpmnXmlComparator condition whitespace normalization', () => {
    it('ignores whitespace-only reformatting of a sequence flow condition', () => {
        const result = compare(reformattedCondition, base);
        assert.deepEqual(Array.from(result.changedRowIds), []);
        assert.deepEqual(Array.from(result.changedShapeIds), []);
        assert.equal(result.nodeIdToDiffsMap.size, 0);
        assert.equal(result.nodeIdToConditions.size, 0);
    });

    it('still detects a real condition change despite reformatting', () => {
        const result = compare(reformattedCondition, withCondition('${approved == false}'));
        assert.deepEqual(Array.from(result.changedRowIds), ['Flow_2']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { Flow_2: ['Condition'] });
    });

    it('treats whitespace inside string literals as significant', () => {
        const result = compare(withCondition('${status == "a b"}'), withCondition('${status == "a  b"}'));
        assert.deepEqual(Array.from(result.changedRowIds), ['Flow_2']);
    });

    it('does not merge keyword operators when removing whitespace', () => {
        const result = compare(withCondition('${a ne b}'), withCondition('${aneb}'));
        assert.deepEqual(Array.from(result.changedRowIds), ['Flow_2']);
    });

    it('keeps tracking string literal boundaries after an escaped quote', () => {
        const result = compare(withCondition('${s == "a\\" b"}'), withCondition('${s == "a\\"  b"}'));
        assert.deepEqual(Array.from(result.changedRowIds), ['Flow_2']);
    });

    it('treats whitespace as significant in script conditions (language attribute)', () => {
        const result = compare(withScriptCondition('if (a)  return b'), withScriptCondition('if (a) return b'));
        assert.deepEqual(Array.from(result.changedRowIds), ['Flow_2']);
    });
});
