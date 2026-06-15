'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { ElementSearcher } = createScope();

// Minimal moddle-like business objects: plain objects with the same shape
// bpmn-js exposes (id/name + nested anonymous config under conditionExpression /
// extensionElements, and references to other elements carrying their own id).
function elem(id, businessObject) {
    return { id, businessObject };
}

function registry(elements) {
    return {
        getAll: () => elements,
        get: id => elements.find(e => e.id === id) || null
    };
}

describe('ElementSearcher.buildSearchText', () => {
    const text = bo => ElementSearcher.buildSearchText(bo);

    it('collects name and id, lowercased', () => {
        assert.equal(text({ id: 'Task_1', name: 'Approve Loan' }), 'task_1 approve loan');
    });

    it('collects primitive attribute values (delegate/topic/booleans)', () => {
        const result = text({
            id: 'Task_1',
            name: 'svc',
            delegateExpression: '${myBean}',
            asyncBefore: true
        });
        assert.ok(result.includes('${mybean}'));
        assert.ok(result.includes('true'));
    });

    it('reaches the condition expression body', () => {
        const bo = {
            id: 'Flow_1',
            conditionExpression: { body: '${preapprove_reapeated_turnover > 0}' }
        };
        assert.ok(text(bo).includes('preapprove_reapeated_turnover'));
    });

    it('reaches In/Out mapping targets inside extensionElements', () => {
        const bo = {
            id: 'CallActivity_1',
            extensionElements: {
                values: [
                    { target: 'orderId', source: 'id' }
                ]
            }
        };
        const result = text(bo);
        assert.ok(result.includes('orderid'));
        assert.ok(result.includes('id'));
    });

    it('reaches input parameter names and values', () => {
        const bo = {
            id: 'Task_1',
            extensionElements: {
                values: [
                    { inputParameters: [{ name: 'amount', body: '${total}' }] }
                ]
            }
        };
        const result = text(bo);
        assert.ok(result.includes('amount'));
        assert.ok(result.includes('${total}'));
    });

    it('collects $attrs values (non-modeled attributes)', () => {
        const bo = { id: 'Task_1', $attrs: { 'camunda:class': 'com.foo.Bar' } };
        assert.ok(text(bo).includes('com.foo.bar'));
    });

    it('does not absorb referenced elements (they carry their own id)', () => {
        const bo = {
            id: 'Flow_1',
            targetRef: { id: 'Task_2', name: 'SecretTarget' }
        };
        const result = text(bo);
        assert.ok(result.includes('flow_1'));
        assert.ok(!result.includes('secrettarget'));
    });

    it('skips di and $-prefixed keys', () => {
        const bo = { id: 'Task_1', $type: 'bpmn:Task', di: { fill: 'red' } };
        assert.equal(text(bo), 'task_1');
    });

    it('terminates on cyclic references', () => {
        const a = { id: 'A', name: 'alpha' };
        const b = { name: 'beta', back: a };
        a.forward = b;
        const result = text(a);
        assert.ok(result.includes('alpha'));
        assert.ok(result.includes('beta'));
    });
});

describe('ElementSearcher.search', () => {
    function searcherFor(elements) {
        const searcher = new ElementSearcher();
        searcher.buildIndex(registry(elements));
        return searcher;
    }

    it('matches by name, case-insensitively', () => {
        const searcher = searcherFor([elem('Task_1', { id: 'Task_1', name: 'Approve Loan' })]);
        assert.deepEqual(Array.from(searcher.search('approve')), ['Task_1']);
        assert.deepEqual(Array.from(searcher.search('LOAN')), ['Task_1']);
    });

    it('matches by id', () => {
        const searcher = searcherFor([elem('Activity_xyz', { id: 'Activity_xyz' })]);
        assert.deepEqual(Array.from(searcher.search('activity_xyz')), ['Activity_xyz']);
    });

    it('matches by a variable used in a condition expression', () => {
        const searcher = searcherFor([
            elem('Flow_1', { id: 'Flow_1', conditionExpression: { body: '${preapprove_reapeated_turnover}' } }),
            elem('Flow_2', { id: 'Flow_2', conditionExpression: { body: '${other}' } })
        ]);
        assert.deepEqual(Array.from(searcher.search('preapprove_reapeated_turnover')), ['Flow_1']);
    });

    it('returns matches in element (index) order', () => {
        const searcher = searcherFor([
            elem('A', { id: 'A', name: 'task' }),
            elem('B', { id: 'B', name: 'task' }),
            elem('C', { id: 'C', name: 'task' })
        ]);
        assert.deepEqual(Array.from(searcher.search('task')), ['A', 'B', 'C']);
    });

    it('returns no matches for empty or blank query', () => {
        const searcher = searcherFor([elem('Task_1', { id: 'Task_1', name: 'x' })]);
        assert.deepEqual(Array.from(searcher.search('')), []);
        assert.deepEqual(Array.from(searcher.search('   ')), []);
    });

    it('skips label shapes and elements without a business object', () => {
        const searcher = searcherFor([
            elem('Task_1', { id: 'Task_1', name: 'real' }),
            elem('Task_1_label', { id: 'Task_1', name: 'real' }),
            elem('NoBo', null)
        ]);
        assert.deepEqual(Array.from(searcher.search('real')), ['Task_1']);
    });

    it('reflects the latest index after a rebuild', () => {
        const searcher = new ElementSearcher();
        searcher.buildIndex(registry([elem('Old', { id: 'Old', name: 'gamma' })]));
        searcher.buildIndex(registry([elem('New', { id: 'New', name: 'delta' })]));
        assert.deepEqual(Array.from(searcher.search('gamma')), []);
        assert.deepEqual(Array.from(searcher.search('delta')), ['New']);
    });
});
