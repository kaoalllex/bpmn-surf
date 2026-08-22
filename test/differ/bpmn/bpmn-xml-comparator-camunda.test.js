'use strict';

// Property-group mapping and structural detection of BpmnXmlComparator
// on Camunda-specific constructs (fixture: camunda-base.bpmn).
// One test = one change type, built as a single string replacement of the base.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope, fixture, mapToObject } = require('#scope');

const { BpmnXmlComparator } = createScope();

const base = fixture('camunda-base.bpmn');

// Builds a one-change variant of camunda-base.bpmn.
// Throws if the anchor is gone or ambiguous, so a fixture edit fails loudly here, not in asserts.
function variant(oldString, newString) {
    if (!base.includes(oldString)) {
        throw new Error(`camunda-base.bpmn does not contain the anchor: ${oldString}`);
    }
    if (base.indexOf(oldString) !== base.lastIndexOf(oldString)) {
        throw new Error(`camunda-base.bpmn contains the anchor more than once: ${oldString}`);
    }
    return base.replace(oldString, newString);
}

function compare(myXml, otherXml) {
    return new BpmnXmlComparator().compare(myXml, otherXml);
}

// Rebuilds the nested Map(id -> Map(group -> [{label, changed}])) as a host-side
// plain object so cross-realm assert.deepEqual works (see scope.js#mapToObject).
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

describe('BpmnXmlComparator camunda fixture sanity', () => {
    it('finds no diffs for identical documents', () => {
        assertNoDiffs(compare(base, base));
    });
});

// The nested children of extensionElements are where indentation used to leak into
// the diff: the walk pairs children by position, so the whitespace an indented
// document adds inside them made every such element read as changed (FEAT-0031 —
// the edit baseline is compact, the recompute indented).
const compact = (xml) => xml.replace(/>\s+</g, '><');

describe('BpmnXmlComparator indentation of extension elements', () => {
    it('finds no diffs between a compact document and its indented twin', () => {
        assertNoDiffs(compare(compact(base), base));
    });

    it('still detects a changed extension element between the two forms', () => {
        const changed = variant('<camunda:in source="varIn" target="varIn" />',
                                '<camunda:in source="varIn" target="varRenamed" />');
        const result = compare(compact(changed), base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['CallActivity_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { CallActivity_1: ['In mappings'] });
    });
});

describe('BpmnXmlComparator property group: Asynchronous continuations', () => {
    it('detects removed camunda:asyncBefore on a service task', () => {
        const changed = variant(
            'camunda:asyncBefore="true" camunda:delegateExpression="${serviceOneDelegate}"',
            'camunda:delegateExpression="${serviceOneDelegate}"');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['ServiceTask_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { ServiceTask_1: ['Asynchronous continuations'] });
    });

    it('detects added camunda:asyncAfter on a service task', () => {
        const changed = variant(
            'camunda:asyncBefore="true" camunda:delegateExpression="${serviceOneDelegate}"',
            'camunda:asyncBefore="true" camunda:asyncAfter="true" camunda:delegateExpression="${serviceOneDelegate}"');
        const result = compare(changed, base);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { ServiceTask_1: ['Asynchronous continuations'] });
    });

    it('detects added camunda:exclusive on a service task', () => {
        const changed = variant(
            'camunda:asyncBefore="true" camunda:delegateExpression="${serviceOneDelegate}"',
            'camunda:asyncBefore="true" camunda:exclusive="false" camunda:delegateExpression="${serviceOneDelegate}"');
        const result = compare(changed, base);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { ServiceTask_1: ['Asynchronous continuations'] });
    });

    it('detects added camunda:asyncBefore on a gateway', () => {
        const changed = variant(
            '<bpmn:exclusiveGateway id="Gateway_1" name="Approved?" default="Flow_no">',
            '<bpmn:exclusiveGateway id="Gateway_1" name="Approved?" camunda:asyncBefore="true" default="Flow_no">');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['Gateway_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { Gateway_1: ['Asynchronous continuations'] });
    });
});

describe('BpmnXmlComparator property group: Implementation', () => {
    it('detects changed delegate expression value', () => {
        const changed = variant('${serviceOneDelegate}', '${anotherDelegate}');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['ServiceTask_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { ServiceTask_1: ['Implementation'] });
    });

    it('detects implementation type switch from delegateExpression to expression', () => {
        const changed = variant(
            'camunda:delegateExpression="${serviceOneDelegate}"',
            'camunda:expression="${serviceOneExpression}"');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['ServiceTask_1']);
        // Both the added and the removed attribute map to the same group (no dedup)
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { ServiceTask_1: ['Implementation', 'Implementation'] });
    });
});

describe('BpmnXmlComparator property group: Documentation', () => {
    it('detects added bpmn:documentation', () => {
        const changed = variant(
            '<bpmn:incoming>Flow_start</bpmn:incoming>',
            '<bpmn:documentation>some docs</bpmn:documentation>\n      <bpmn:incoming>Flow_start</bpmn:incoming>');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['ServiceTask_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { ServiceTask_1: ['Documentation'] });
    });
});

describe('BpmnXmlComparator property group: Multi-instance', () => {
    it('detects changed camunda:elementVariable', () => {
        const changed = variant('camunda:elementVariable="item" />', 'camunda:elementVariable="item2" />');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['MultiTask_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { MultiTask_1: ['Multi-instance'] });
    });

    it('detects changed camunda:collection', () => {
        const changed = variant('camunda:collection="items"', 'camunda:collection="otherItems"');
        const result = compare(changed, base);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { MultiTask_1: ['Multi-instance'] });
    });

    it('detects added loopCardinality and completionCondition', () => {
        const changed = variant(
            '<bpmn:multiInstanceLoopCharacteristics camunda:asyncBefore="true" camunda:collection="items" camunda:elementVariable="item" />',
            '<bpmn:multiInstanceLoopCharacteristics camunda:asyncBefore="true" camunda:collection="items" camunda:elementVariable="item">\n' +
            '        <bpmn:loopCardinality xsi:type="bpmn:tFormalExpression">3</bpmn:loopCardinality>\n' +
            '        <bpmn:completionCondition xsi:type="bpmn:tFormalExpression">${done}</bpmn:completionCondition>\n' +
            '      </bpmn:multiInstanceLoopCharacteristics>');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['MultiTask_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { MultiTask_1: ['Multi-instance', 'Multi-instance'] });
    });
});

describe('BpmnXmlComparator subprocess comparison rules', () => {
    it('detects multi-instance attribute change on the subprocess itself', () => {
        const changed = variant(
            '<bpmn:multiInstanceLoopCharacteristics camunda:asyncBefore="true" camunda:collection="subItems" camunda:elementVariable="subItem" />',
            '<bpmn:multiInstanceLoopCharacteristics camunda:asyncBefore="true" camunda:asyncAfter="true" camunda:collection="subItems" camunda:elementVariable="subItem" />');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['SubProcess_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { SubProcess_1: ['Asynchronous continuations'] });
    });

    it('detects added extensionElements on the subprocess itself', () => {
        const changed = variant(
            '<bpmn:subProcess id="SubProcess_1" name="Sub process one" camunda:asyncBefore="true">',
            '<bpmn:subProcess id="SubProcess_1" name="Sub process one" camunda:asyncBefore="true">\n' +
            '      <bpmn:extensionElements>\n' +
            '        <camunda:executionListener class="com.example.Listener" event="start" />\n' +
            '      </bpmn:extensionElements>');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['SubProcess_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { SubProcess_1: ['Execution listeners'] });
    });

    it('flags a changed inner element but not the enclosing subprocess', () => {
        const changed = variant('name="Inner task"', 'name="Inner task renamed"');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['SubTask_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { SubTask_1: ['General'] });
    });

    it('detects an element added inside a subprocess without flagging the subprocess', () => {
        const changed = variant(
            '      <bpmn:sequenceFlow id="Flow_sub_end" sourceRef="SubTask_1" targetRef="SubEndEvent_1" />\n',
            '      <bpmn:sequenceFlow id="Flow_sub_end" sourceRef="SubTask_1" targetRef="SubEndEvent_1" />\n' +
            '      <bpmn:serviceTask id="SubTask_2" name="Inner task two" />\n');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.missingShapeIds), ['SubTask_2']);
        assert.deepEqual(Array.from(result.changedShapeIds), []);
    });
});

describe('BpmnXmlComparator property group: Execution listeners', () => {
    it('detects removed execution listener', () => {
        const changed = variant(
            '        <camunda:executionListener delegateExpression="${callListener}" event="start" />\n',
            '');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['CallActivity_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { CallActivity_1: ['Execution listeners'] });
    });

    it('detects changed execution listener delegate expression', () => {
        const changed = variant('${callListener}', '${otherListener}');
        const result = compare(changed, base);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { CallActivity_1: ['Execution listeners'] });
    });
});

describe('BpmnXmlComparator property group: Called element', () => {
    it('detects changed calledElement', () => {
        const changed = variant('calledElement="CalledProcess"', 'calledElement="OtherProcess"');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['CallActivity_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { CallActivity_1: ['Called element'] });
    });

    it('detects changed business key', () => {
        const changed = variant('#{execution.processBusinessKey}', '#{execution.parentBusinessKey}');
        const result = compare(changed, base);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { CallActivity_1: ['Called element'] });
    });
});

describe('BpmnXmlComparator property groups: In mappings / Out mappings', () => {
    it('detects removed camunda:in mapping', () => {
        const changed = variant('        <camunda:in source="varIn" target="varIn" />\n', '');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['CallActivity_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { CallActivity_1: ['In mappings'] });
    });

    it('detects removed camunda:out mapping', () => {
        const changed = variant('        <camunda:out source="varOut" target="varOut" />\n', '');
        const result = compare(changed, base);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { CallActivity_1: ['Out mappings'] });
    });

    it('detects changed camunda:in sourceExpression', () => {
        const changed = variant('${item.id}', '${item.code}');
        const result = compare(changed, base);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { CallActivity_1: ['In mappings'] });
    });

    it('detects a camunda:in replaced by camunda:out (child count unchanged)', () => {
        const changed = variant(
            '<camunda:in source="varIn" target="varIn" />',
            '<camunda:out source="varIn" target="varIn" />');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['CallActivity_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { CallActivity_1: ['Out mappings', 'In mappings'] });
    });

    it('detects a camunda:in replaced by an inputOutput block (child count unchanged)', () => {
        const changed = variant(
            '<camunda:in sourceExpression="${item.id}" target="itemId" />',
            '<camunda:inputOutput>\n' +
            '          <camunda:inputParameter name="Input_1" />\n' +
            '          <camunda:outputParameter name="Output_1" />\n' +
            '        </camunda:inputOutput>');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['CallActivity_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { CallActivity_1: ['Inputs', 'Outputs', 'In mappings'] });
    });

    it('ignores reordering of unchanged extension elements with different tags', () => {
        const changed = variant(
            '<camunda:in sourceExpression="${item.id}" target="itemId" />\n' +
            '        <camunda:out source="varOut" target="varOut" />',
            '<camunda:out source="varOut" target="varOut" />\n' +
            '        <camunda:in sourceExpression="${item.id}" target="itemId" />');
        assertNoDiffs(compare(changed, base));
    });
});

describe('BpmnXmlComparator per-entry list group changes (nodeIdToMappingChanges)', () => {
    it('marks an in mapping present only in the shown version as not-changed (added/removed)', () => {
        // Comparing base (has varIn) against a version without it: varIn is only in the shown side
        const other = variant('        <camunda:in source="varIn" target="varIn" />\n', '');
        const result = compare(base, other);
        assert.deepEqual(mappingChangesToObject(result.nodeIdToMappingChanges), {
            CallActivity_1: { 'In mappings': [{ label: 'varIn', changed: false }] }
        });
    });

    it('emits no entry descriptor for a mapping absent from the shown version (only the group highlight)', () => {
        // The shown (my) version lacks varIn; a removed entry has no list item in the panel
        const changed = variant('        <camunda:in source="varIn" target="varIn" />\n', '');
        const result = compare(changed, base);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { CallActivity_1: ['In mappings'] });
        assert.equal(result.nodeIdToMappingChanges.size, 0);
    });

    it('marks an in mapping with the same target but changed content as changed', () => {
        const changed = variant('${item.id}', '${item.code}');
        const result = compare(changed, base);
        assert.deepEqual(mappingChangesToObject(result.nodeIdToMappingChanges), {
            CallActivity_1: { 'In mappings': [{ label: 'itemId', changed: true }] }
        });
    });

    it('marks an out mapping present only in the shown version', () => {
        const other = variant('        <camunda:out source="varOut" target="varOut" />\n', '');
        const result = compare(base, other);
        assert.deepEqual(mappingChangesToObject(result.nodeIdToMappingChanges), {
            CallActivity_1: { 'Out mappings': [{ label: 'varOut', changed: false }] }
        });
    });

    it('marks a changed input parameter by its name', () => {
        const changed = variant('TEMPLATE_ONE', 'TEMPLATE_TWO');
        const result = compare(changed, base);
        assert.deepEqual(mappingChangesToObject(result.nodeIdToMappingChanges), {
            SendTask_1: { Inputs: [{ label: 'messageTemplate', changed: true }] }
        });
    });

    it('emits no entry descriptor for a propagate-all (variables="all") in mapping, leaving only the group highlight', () => {
        const changed = variant(
            '        <camunda:in source="varIn" target="varIn" />\n',
            '        <camunda:in source="varIn" target="varIn" />\n' +
            '        <camunda:in variables="all" />\n');
        const result = compare(changed, base);
        // The panel shows propagate-all in its own group, not among the mappings, and it
        // is not a list entry there — so a whole-group highlight and no descriptor
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap),
            { CallActivity_1: ['In mapping propagation'] });
        assert.equal(result.nodeIdToMappingChanges.size, 0);
    });
});

describe('BpmnXmlComparator property groups: Inputs / Outputs / Extension properties', () => {
    it('detects changed input parameter value', () => {
        const changed = variant('TEMPLATE_ONE', 'TEMPLATE_TWO');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['SendTask_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { SendTask_1: ['Inputs'] });
    });

    it('detects added output parameter', () => {
        const changed = variant(
            '<camunda:inputParameter name="messageTemplate">TEMPLATE_ONE</camunda:inputParameter>',
            '<camunda:inputParameter name="messageTemplate">TEMPLATE_ONE</camunda:inputParameter>\n' +
            '          <camunda:outputParameter name="result" />');
        const result = compare(changed, base);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { SendTask_1: ['Outputs'] });
    });

    it('detects removed inputOutput block (unwrapped to the Inputs group)', () => {
        const changed = variant(
            '      <bpmn:extensionElements>\n' +
            '        <camunda:inputOutput>\n' +
            '          <camunda:inputParameter name="messageTemplate">TEMPLATE_ONE</camunda:inputParameter>\n' +
            '        </camunda:inputOutput>\n' +
            '      </bpmn:extensionElements>\n',
            '');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['SendTask_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { SendTask_1: ['Inputs'] });
    });

    it('detects added camunda:properties', () => {
        const changed = variant(
            '        <camunda:executionListener delegateExpression="${callListener}" event="start" />\n      </bpmn:extensionElements>',
            '        <camunda:executionListener delegateExpression="${callListener}" event="start" />\n' +
            '        <camunda:properties>\n' +
            '          <camunda:property name="prop1" />\n' +
            '        </camunda:properties>\n' +
            '      </bpmn:extensionElements>');
        const result = compare(changed, base);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { CallActivity_1: ['Extension properties'] });
    });
});

describe('BpmnXmlComparator property group: Timer', () => {
    it('detects changed timer duration (flags the event and its definition node)', () => {
        const changed = variant('P5D', 'P10D');
        const result = compare(changed, base);
        // The timerEventDefinition has its own id, so it is reported alongside the event
        assert.deepEqual(Array.from(result.changedShapeIds), ['TimerEvent_1', 'TimerEventDefinition_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), {
            TimerEvent_1: ['Timer'],
            TimerEventDefinition_1: ['Timer']
        });
    });
});

describe('BpmnXmlComparator property group: Condition (conditional event)', () => {
    it('detects changed camunda:variableName', () => {
        const changed = variant('camunda:variableName="allDone"', 'camunda:variableName="allFinished"');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['ConditionalEvent_1', 'ConditionalEventDefinition_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), {
            ConditionalEvent_1: ['Condition'],
            ConditionalEventDefinition_1: ['Condition']
        });
    });

    it('detects changed condition body', () => {
        const changed = variant('${allDone}', '${allDoneForReal}');
        const result = compare(changed, base);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), {
            ConditionalEvent_1: ['Condition'],
            ConditionalEventDefinition_1: ['Condition']
        });
    });
});

describe('BpmnXmlComparator property group: Job execution', () => {
    it('detects added camunda:jobPriority', () => {
        const changed = variant(
            'camunda:asyncBefore="true" camunda:delegateExpression="${multiDelegate}"',
            'camunda:asyncBefore="true" camunda:jobPriority="1" camunda:delegateExpression="${multiDelegate}"');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['MultiTask_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { MultiTask_1: ['Job execution'] });
    });

    it('detects added camunda:failedJobRetryTimeCycle', () => {
        const changed = variant(
            '      <bpmn:incoming>Flow_no</bpmn:incoming>',
            '      <bpmn:extensionElements>\n' +
            '        <camunda:failedJobRetryTimeCycle>R3/PT1M</camunda:failedJobRetryTimeCycle>\n' +
            '      </bpmn:extensionElements>\n' +
            '      <bpmn:incoming>Flow_no</bpmn:incoming>');
        const result = compare(changed, base);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { MultiTask_1: ['Job execution'] });
    });
});

describe('BpmnXmlComparator property group: Message', () => {
    it('detects renamed message and flags the referencing event', () => {
        const changed = variant('name="STATUS_CHANGED"', 'name="STATUS_CHANGED_V2"');
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedShapeIds), ['MessageStartEvent_1', 'MessageEventDefinition_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), {
            MessageStartEvent_1: ['Message'],
            MessageEventDefinition_1: ['Message']
        });
    });
});

describe('BpmnXmlComparator property group: Escalation', () => {
    it('detects renamed escalation and flags only the events referencing it', () => {
        const changed = variant(
            'name="START_CHECKS" escalationCode="START_CHECKS"',
            'name="START_CHECKS_V2" escalationCode="START_CHECKS_V2"');
        const result = compare(changed, base);
        // EscalationStartEvent_1 references the untouched Escalation_2 and must stay clean
        assert.deepEqual(Array.from(result.changedShapeIds), ['EscalationThrowEvent_1', 'EscalationEventDefinition_1']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), {
            EscalationThrowEvent_1: ['Escalation'],
            EscalationEventDefinition_1: ['Escalation']
        });
    });

    it('detects escalation rename in both comparison directions', () => {
        const changed = variant(
            'name="HANDLE_PROBLEM" escalationCode="HANDLE_PROBLEM"',
            'name="HANDLE_PROBLEM_V2" escalationCode="HANDLE_PROBLEM_V2"');
        const result = compare(base, changed);
        assert.deepEqual(Array.from(result.changedShapeIds), ['EscalationStartEvent_1', 'EscalationEventDefinition_2']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), {
            EscalationStartEvent_1: ['Escalation'],
            EscalationEventDefinition_2: ['Escalation']
        });
    });
});

describe('BpmnXmlComparator complex sequence flow condition', () => {
    const complexCondition =
        '${(ex.func("AAA") &amp;&amp; !AAA &amp;&amp; BBB) || (LLL.size() &gt; 0 &amp;&amp; DDD != "\\"&amp;&amp;||{}()")}';
    const complexConditionText =
        '${(ex.func("AAA") && !AAA && BBB) || (LLL.size() > 0 && DDD != "\\"&&||{}()")}';

    it('captures both condition texts with escaped quotes and operators inside string literals', () => {
        const changed = variant('${approved == true}', complexCondition);
        const result = compare(changed, base);
        assert.deepEqual(Array.from(result.changedRowIds), ['Flow_yes']);
        assert.deepEqual(mapToObject(result.nodeIdToDiffsMap), { Flow_yes: ['Condition'] });
        assert.deepEqual(mapToObject(result.nodeIdToConditions), {
            Flow_yes: [complexConditionText, '${approved == true}']
        });
    });
});

describe('BpmnXmlComparator blind zones (documented current behavior)', () => {
    it('ignores sequence flow retargeting (targetRef is deliberately skipped)', () => {
        const changed = variant('targetRef="MultiTask_1"', 'targetRef="SendTask_1"');
        assertNoDiffs(compare(changed, base));
        assertNoDiffs(compare(base, changed));
    });

    it('ignores gateway incoming/outgoing rewiring (connectors are derived from flows)', () => {
        const changed = variant('<bpmn:outgoing>Flow_yes</bpmn:outgoing>', '<bpmn:outgoing>Flow_other</bpmn:outgoing>');
        assertNoDiffs(compare(changed, base));
    });

    it('ignores changed default flow of a gateway (the default attribute is skipped)', () => {
        const changed = variant('default="Flow_no"', 'default="Flow_yes"');
        assertNoDiffs(compare(changed, base));
    });
});
