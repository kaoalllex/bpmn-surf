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
    // Clearing a field's value leaves its element behind, empty, exactly as deleting the
    // last list entry leaves the container behind.
    it('ignores an extension element whose value was cleared', () => {
        const withEmptyField = base.replace(
            '<bpmn:incoming>Flow_1</bpmn:incoming>',
            '<bpmn:extensionElements><camunda:failedJobRetryTimeCycle /></bpmn:extensionElements>'
                + '<bpmn:incoming>Flow_1</bpmn:incoming>');
        assert.deepEqual(Array.from(compare(withEmptyField, base).changedShapeIds), []);
    });

    it('still reports an extension element that has a value', () => {
        const withField = base.replace(
            '<bpmn:incoming>Flow_1</bpmn:incoming>',
            '<bpmn:extensionElements><camunda:failedJobRetryTimeCycle>R3/PT10M'
                + '</camunda:failedJobRetryTimeCycle></bpmn:extensionElements>'
                + '<bpmn:incoming>Flow_1</bpmn:incoming>');
        const result = compare(withField, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['Task_1']);
        assert.deepEqual(Array.from(result.nodeIdToDiffsMap.get('Task_1')), ['Job execution']);
    });

    // An event definition is the value of an element, not a container of one: dropping
    // empty bpmn: elements would hide a start event becoming a terminate end event.
    it('does not ignore an empty bpmn event definition', () => {
        const terminating = base.replace(
            '<bpmn:incoming>Flow_2</bpmn:incoming>',
            '<bpmn:incoming>Flow_2</bpmn:incoming><bpmn:terminateEventDefinition />');
        assert.deepEqual(Array.from(compare(terminating, base).changedShapeIds), ['EndEvent_1']);
    });

    // Both paths that report a differing child walked the raw child nodes, so an element
    // left empty by clearing its field came back as a diff of its own group as soon as a
    // real edit landed next to it.
    const withExtensions = (entries) => base.replace(
        '<bpmn:incoming>Flow_1</bpmn:incoming>',
        `<bpmn:extensionElements>${entries}</bpmn:extensionElements>`
            + '<bpmn:incoming>Flow_1</bpmn:incoming>');
    const EMPTY_FIELD = '<camunda:failedJobRetryTimeCycle />';
    const ADDED_PROPERTY = '<camunda:properties>'
        + '<camunda:property name="propA" value="1" /></camunda:properties>';

    // camunda:in carries three unrelated panel groups: a variable mapping, the business
    // key of Called element, and the "all variables" propagation. Reporting the tag name
    // alone sent every one of them to In mappings.
    it('maps a removed business key to the Called element group', () => {
        const result = compare(
            withExtensions('<camunda:in source="a" target="b" />'),
            withExtensions('<camunda:in source="a" target="b" />'
                + '<camunda:in businessKey="#{execution.processBusinessKey}" />'));
        assert.deepEqual(Array.from(result.nodeIdToDiffsMap.get('Task_1')), ['Called element']);
    });

    it('maps an added variable propagation to its own group', () => {
        const added = (tag) => compare(
            withExtensions(`<camunda:${tag} variables="all" />`), base)
            .nodeIdToDiffsMap.get('Task_1');
        assert.deepEqual(Array.from(added('in')), ['In mapping propagation']);
        assert.deepEqual(Array.from(added('out')), ['Out mapping propagation']);
    });

    it('still maps a plain mapping entry to In mappings', () => {
        const result = compare(
            withExtensions('<camunda:in source="a" target="b" />'), base);
        assert.deepEqual(Array.from(result.nodeIdToDiffsMap.get('Task_1')), ['In mappings']);
    });

    it('ignores an emptied element next to a real change in existing extension elements', () => {
        const result = compare(
            withExtensions('<camunda:in source="a" target="b" />' + EMPTY_FIELD + ADDED_PROPERTY),
            withExtensions('<camunda:in source="a" target="b" />'));
        assert.deepEqual(Array.from(result.nodeIdToDiffsMap.get('Task_1')), ['Extension properties']);
    });

    it('ignores an emptied element inside newly added extension elements', () => {
        const result = compare(withExtensions(EMPTY_FIELD + ADDED_PROPERTY), base);
        assert.deepEqual(Array.from(result.nodeIdToDiffsMap.get('Task_1')), ['Extension properties']);
    });

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

    // The Extension properties group is a list like the mappings: the panel labels each
    // entry by its name, so the changed and added entries can be pointed at individually.
    it('reports the changed entries of the Extension properties list', () => {
        const withProps = (entries) => base.replace(
            '<bpmn:incoming>Flow_1</bpmn:incoming>',
            `<bpmn:extensionElements><camunda:properties>${entries}</camunda:properties>`
                + '</bpmn:extensionElements><bpmn:incoming>Flow_1</bpmn:incoming>');
        const mine = withProps('<camunda:property name="kept" value="1" />'
            + '<camunda:property name="edited" value="2" />'
            + '<camunda:property name="added" value="3" />');
        const other = withProps('<camunda:property name="kept" value="1" />'
            + '<camunda:property name="edited" value="OLD" />');

        const changes = compare(mine, other).nodeIdToMappingChanges.get('Task_1');
        assert.deepEqual(
            Array.from(changes.get('Extension properties'), (d) => `${d.label}:${d.changed}`),
            ['edited:true', 'added:false']);
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

// isExecutable is a deployment flag, not a diffing one: clearing it in the properties
// panel (or opening a non-executable file) must not blank the diff — and used to throw,
// because the executable-process lookup was dereferenced without a guard (BUG-0029).
describe('BpmnXmlComparator non-executable process', () => {
    const nonExecutable = (xml) => xml.replace(/isExecutable="true"/g, 'isExecutable="false"');
    const noProcess = base.replace(/<bpmn:process[\s\S]*<\/bpmn:process>/, '');

    it('compares the only process even when it is not executable', () => {
        const result = compare(nonExecutable(changedName), nonExecutable(base));
        assert.deepEqual(Array.from(result.changedShapeIds), ['Task_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { Task_1: ['General'] });
    });

    it('keeps the executable process when one of several is executable', () => {
        const twoProcesses = (xml) => xml.replace(
            '<bpmn:process',
            '<bpmn:process id="Process_0" isExecutable="false"><bpmn:task id="Ignored_1" /></bpmn:process><bpmn:process'
        );
        const result = compare(twoProcesses(changedName), twoProcesses(base));
        assert.equal(result.processNode.getAttribute('id'), 'Process_1');
        assert.deepEqual(Array.from(result.changedShapeIds), ['Task_1']);
    });

    it('yields an empty diff when the document has no process at all', () => {
        const result = compare(noProcess, base);
        assert.deepEqual(Array.from(result.missingShapeIds), []);
        assert.deepEqual(Array.from(result.changedShapeIds), []);
        assert.equal(result.nodeIdToDiffsMap.size, 0);
    });
});
