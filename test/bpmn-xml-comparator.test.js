'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope, fixture, mapToObject } = require('./support/scope.js');

const { BpmnXmlComparator } = createScope();

const base = fixture('base.bpmn');
const addedTask = fixture('added-task.bpmn');
const changedName = fixture('changed-name.bpmn');
const changedCondition = fixture('changed-condition.bpmn');

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

    it('detects changed task name and maps it to the General property group', () => {
        const result = compare(changedName, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['Task_1']);
        assert.deepEqual(Array.from(result.changedRowIds), []);
        // current behavior: a changed attribute is reported once per comparison
        // direction (the dedup check in #getAttributesDiffs compares unprefixed
        // names against 'tag/name' entries), hence the duplicated group
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { Task_1: ['General', 'General'] });
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
