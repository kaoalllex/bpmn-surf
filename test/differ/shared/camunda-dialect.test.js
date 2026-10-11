'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { CAMUNDA_DIALECT, detectCamundaDialect, isFeelExpression } = createScope();

const definitions = (attributes) =>
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ${attributes}></bpmn:definitions>`;
const ZEEBE_NAMESPACE = 'xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"';
const CAMUNDA_CLOUD = 'xmlns:modeler="http://camunda.org/schema/modeler/1.0" modeler:executionPlatform="Camunda Cloud"';
const CAMUNDA_7 = 'xmlns:camunda="http://camunda.org/schema/1.0/bpmn" ' +
    'xmlns:modeler="http://camunda.org/schema/modeler/1.0" modeler:executionPlatform="Camunda Platform"';

describe('detectCamundaDialect', () => {
    it('is c8 for the zeebe namespace alone', () => {
        assert.equal(detectCamundaDialect(definitions(ZEEBE_NAMESPACE)), CAMUNDA_DIALECT.C8);
    });

    it('is c8 for the Camunda Cloud execution platform alone', () => {
        assert.equal(detectCamundaDialect(definitions(CAMUNDA_CLOUD)), CAMUNDA_DIALECT.C8);
    });

    it('is c8 for both markers', () => {
        assert.equal(detectCamundaDialect(definitions(`${ZEEBE_NAMESPACE} ${CAMUNDA_CLOUD}`)), CAMUNDA_DIALECT.C8);
    });

    it('is c7 for a Camunda 7 document', () => {
        assert.equal(detectCamundaDialect(definitions(CAMUNDA_7)), CAMUNDA_DIALECT.C7);
    });

    it('is c7 for plain BPMN', () => {
        assert.equal(detectCamundaDialect(definitions('')), CAMUNDA_DIALECT.C7);
    });

    it('is c8 for a Camunda 8 DMN', () => {
        const dmn = `<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" ${CAMUNDA_CLOUD}></definitions>`;
        assert.equal(detectCamundaDialect(dmn), CAMUNDA_DIALECT.C8);
    });

    it('accepts single-quoted attributes', () => {
        assert.equal(detectCamundaDialect(definitions("xmlns:zeebe='http://camunda.org/schema/zeebe/1.0'")),
            CAMUNDA_DIALECT.C8);
    });

    it('is c8 when either version is c8 (a 7-vs-8 diff)', () => {
        assert.equal(detectCamundaDialect(definitions(CAMUNDA_7), definitions(ZEEBE_NAMESPACE)), CAMUNDA_DIALECT.C8);
    });

    it('ignores a missing version', () => {
        assert.equal(detectCamundaDialect(null, definitions(CAMUNDA_7), undefined), CAMUNDA_DIALECT.C7);
    });
});

describe('isFeelExpression', () => {
    it('is true for an expression starting with =', () => {
        assert.equal(isFeelExpression('=subProcessVar'), true);
    });

    it('is false for a plain id, a JUEL expression and no value', () => {
        assert.equal(isFeelExpression('PaymentC8'), false);
        assert.equal(isFeelExpression('${x}'), false);
        assert.equal(isFeelExpression(undefined), false);
    });
});

describe('calledProcessId / calledDecisionId', () => {
    const withExtensions = (...values) => ({ extensionElements: { values } });

    it('reads calledElement in C7', () => {
        assert.equal(CAMUNDA_DIALECT.C7.calledProcessId({ calledElement: 'Sub' }), 'Sub');
    });

    it('reads the processId of zeebe:CalledElement in C8', () => {
        assert.equal(CAMUNDA_DIALECT.C8.calledProcessId(withExtensions(
            { $type: 'zeebe:IoMapping' }, { $type: 'zeebe:CalledElement', processId: 'PaymentC8' })),
        'PaymentC8');
    });

    it('does not read the other dialect', () => {
        assert.equal(CAMUNDA_DIALECT.C8.calledProcessId({ calledElement: 'Sub' }), null);
        assert.equal(CAMUNDA_DIALECT.C7.calledProcessId(withExtensions({ $type: 'zeebe:CalledElement', processId: 'X' })),
            null);
    });

    it('reads decisionRef in C7 and the decisionId of zeebe:CalledDecision in C8', () => {
        assert.equal(CAMUNDA_DIALECT.C7.calledDecisionId({ decisionRef: 'Risk' }), 'Risk');
        assert.equal(CAMUNDA_DIALECT.C8.calledDecisionId(withExtensions({ $type: 'zeebe:CalledDecision', decisionId: 'RiskC8' })),
            'RiskC8');
        assert.equal(CAMUNDA_DIALECT.C8.calledDecisionId({ decisionRef: 'Risk' }), null);
    });

    it('returns a FEEL id as is, for the navigator to decide', () => {
        assert.equal(CAMUNDA_DIALECT.C8.calledProcessId(withExtensions({ $type: 'zeebe:CalledElement', processId: '=subProcessVar' })),
            '=subProcessVar');
    });

    it('is null without a business object or extension elements', () => {
        assert.equal(CAMUNDA_DIALECT.C8.calledProcessId(null), null);
        assert.equal(CAMUNDA_DIALECT.C8.calledDecisionId({}), null);
        assert.equal(CAMUNDA_DIALECT.C7.calledProcessId(undefined), null);
    });
});

describe('CAMUNDA_DIALECT.C7.handlerKey', () => {
    // Minimal moddle-like BO: get(name) reads camunda attributes; `type`/`topic`
    // are plain properties (as camunda-moddle defines the external-task fields).
    function bo({ attrs = {}, type, topic, eventDefinitions } = {}) {
        return {
            type,
            topic,
            eventDefinitions,
            get: (name) => attrs[name]
        };
    }

    function msgDef(opts) {
        const def = bo(opts);
        def.$type = 'bpmn:MessageEventDefinition';
        return def;
    }

    function timerDef() {
        const def = bo({});
        def.$type = 'bpmn:TimerEventDefinition';
        return def;
    }

    it('returns a class key for a service task with camunda:class (regression)', () => {
        assert.equal(
            CAMUNDA_DIALECT.C7.handlerKey(bo({ attrs: { 'camunda:class': 'com.foo.ScoreCarDelegate' } })),
            'class:ScoreCarDelegate'
        );
    });

    it('returns a topic key for an external service task (regression)', () => {
        assert.equal(
            CAMUNDA_DIALECT.C7.handlerKey(bo({ type: 'external', topic: 'score-car' })),
            'topic:score-car'
        );
    });

    it('returns a class key from a delegateExpression on a service task (regression)', () => {
        assert.equal(
            CAMUNDA_DIALECT.C7.handlerKey(bo({ attrs: { 'camunda:delegateExpression': '${scoreCarDelegate}' } })),
            'class:ScoreCarDelegate'
        );
    });

    it('reads camunda:class from a nested messageEventDefinition (message end event)', () => {
        const event = bo({ eventDefinitions: [msgDef({ attrs: { 'camunda:class': 'com.foo.NotifyDelegate' } })] });
        assert.equal(CAMUNDA_DIALECT.C7.handlerKey(event), 'class:NotifyDelegate');
    });

    it('reads a delegateExpression from a nested messageEventDefinition', () => {
        const event = bo({ eventDefinitions: [msgDef({ attrs: { 'camunda:delegateExpression': '${notifyBean}' } })] });
        assert.equal(CAMUNDA_DIALECT.C7.handlerKey(event), 'class:NotifyBean');
    });

    it('reads external type/topic from a nested messageEventDefinition', () => {
        const event = bo({ eventDefinitions: [msgDef({ type: 'external', topic: 'notify-topic' })] });
        assert.equal(CAMUNDA_DIALECT.C7.handlerKey(event), 'topic:notify-topic');
    });

    it('picks the messageEventDefinition among several event definitions', () => {
        const event = bo({ eventDefinitions: [timerDef(), msgDef({ attrs: { 'camunda:class': 'Notify' } })] });
        assert.equal(CAMUNDA_DIALECT.C7.handlerKey(event), 'class:Notify');
    });

    it('returns null for a message event with no implementation', () => {
        const event = bo({ eventDefinitions: [msgDef({})] });
        assert.equal(CAMUNDA_DIALECT.C7.handlerKey(event), null);
    });

    it('returns null for a non-message event definition (timer/signal)', () => {
        const event = bo({ eventDefinitions: [timerDef()] });
        assert.equal(CAMUNDA_DIALECT.C7.handlerKey(event), null);
    });

    it('returns null for an element without eventDefinitions or implementation', () => {
        assert.equal(CAMUNDA_DIALECT.C7.handlerKey(bo({})), null);
    });

    it('returns null for a missing business object', () => {
        assert.equal(CAMUNDA_DIALECT.C7.handlerKey(null), null);
        assert.equal(CAMUNDA_DIALECT.C7.handlerKey(undefined), null);
    });
});

describe('CAMUNDA_DIALECT.C8.handlerKey', () => {
    const key = (bo, dialect = CAMUNDA_DIALECT.C7) => dialect.handlerKey(bo);
    const withJobType = (type, extra = {}) =>
        ({ ...extra, extensionElements: { values: [{ $type: 'zeebe:TaskDefinition', type }] } });

    it('a service task → topic:<job type>', () => {
        assert.equal(key(withJobType('find-items'), CAMUNDA_DIALECT.C8), 'topic:find-items');
    });

    it('a message throw event: the job type on the event itself', () => {
        assert.equal(key(withJobType('publish-order-completed',
            { eventDefinitions: [{ $type: 'bpmn:MessageEventDefinition' }] }), CAMUNDA_DIALECT.C8), 'topic:publish-order-completed');
    });

    it('no key for a Camunda connector or a FEEL job type', () => {
        assert.equal(key(withJobType('io.camunda:http-json:1'), CAMUNDA_DIALECT.C8), null);
        assert.equal(key(withJobType('=jobType'), CAMUNDA_DIALECT.C8), null);
    });

    it('no key without a task definition', () => {
        assert.equal(key({ extensionElements: { values: [{ $type: 'zeebe:IoMapping' }] } }, CAMUNDA_DIALECT.C8), null);
        assert.equal(key({}, CAMUNDA_DIALECT.C8), null);
        assert.equal(key(null, CAMUNDA_DIALECT.C8), null);
    });

    it('dialects do not cross', () => {
        assert.equal(key(withJobType('find-items'), CAMUNDA_DIALECT.C7), null);
        assert.equal(key(withJobType('find-items')), null);
        assert.equal(key({ type: 'external', topic: 'validateOrder', get: () => undefined }, CAMUNDA_DIALECT.C8), null);
    });
});

describe('listenerKeys', () => {
    const withExtensions = (...values) => ({ extensionElements: { values } });
    const keys = (dialect, bo) => Array.from(dialect.listenerKeys(bo), (entry) => ({ ...entry }));

    describe('Camunda 7', () => {
        const listener = (type, props) => ({ $type: `camunda:${type}`, ...props });

        it('an execution listener with a class → class:<SimpleName>', () => {
            assert.deepEqual(keys(CAMUNDA_DIALECT.C7, withExtensions(
                listener('ExecutionListener', { event: 'start', class: 'com.example.AuditDelegate' }))),
            [{ key: 'class:AuditDelegate', kind: 'execution', event: 'start' }]);
        });

        it('a delegateExpression → the bean class', () => {
            assert.deepEqual(keys(CAMUNDA_DIALECT.C7, withExtensions(
                listener('ExecutionListener', { event: 'take', delegateExpression: '${auditBean}' }))),
            [{ key: 'class:AuditBean', kind: 'execution', event: 'take' }]);
        });

        it('several listeners → several entries, in document order; a task listener is kind task', () => {
            assert.deepEqual(keys(CAMUNDA_DIALECT.C7, withExtensions(
                listener('TaskListener', { event: 'create', class: 'AssignDelegate' }),
                { $type: 'camunda:InputOutput' },
                listener('ExecutionListener', { event: 'end', class: 'AuditDelegate' }))),
            [
                { key: 'class:AssignDelegate', kind: 'task', event: 'create' },
                { key: 'class:AuditDelegate', kind: 'execution', event: 'end' }
            ]);
        });

        it('script and expression listeners are skipped', () => {
            assert.deepEqual(keys(CAMUNDA_DIALECT.C7, withExtensions(
                listener('ExecutionListener', { event: 'start', expression: '${audit.log(execution)}' }),
                listener('TaskListener', { event: 'create', script: { scriptFormat: 'groovy', value: 'x' } }))), []);
        });

        it('no extensionElements / no business object → empty', () => {
            assert.deepEqual(keys(CAMUNDA_DIALECT.C7, {}), []);
            assert.deepEqual(keys(CAMUNDA_DIALECT.C7, null), []);
        });

        it('reads no Zeebe listener', () => {
            assert.deepEqual(keys(CAMUNDA_DIALECT.C7, withExtensions({ $type: 'zeebe:ExecutionListeners',
                listeners: [{ $type: 'zeebe:ExecutionListener', eventType: 'start', type: 'audit-step' }] })), []);
        });
    });

    describe('Camunda 8', () => {
        const executionListeners = (...listeners) => ({ $type: 'zeebe:ExecutionListeners',
            listeners: listeners.map(([eventType, type]) => ({ $type: 'zeebe:ExecutionListener', eventType, type })) });
        const taskListeners = (...listeners) => ({ $type: 'zeebe:TaskListeners',
            listeners: listeners.map(([eventType, type]) => ({ $type: 'zeebe:TaskListener', eventType, type })) });

        it('an execution listener → topic:<job type>', () => {
            assert.deepEqual(keys(CAMUNDA_DIALECT.C8, withExtensions(
                { $type: 'zeebe:TaskDefinition', type: 'validate-order' }, executionListeners(['start', 'audit-step']))),
            [{ key: 'topic:audit-step', kind: 'execution', event: 'start' }]);
        });

        it('execution and task listeners together', () => {
            assert.deepEqual(keys(CAMUNDA_DIALECT.C8, withExtensions(
                executionListeners(['start', 'audit-step'], ['end', 'audit-end']),
                taskListeners(['completing', 'check-approval']))),
            [
                { key: 'topic:audit-step', kind: 'execution', event: 'start' },
                { key: 'topic:audit-end', kind: 'execution', event: 'end' },
                { key: 'topic:check-approval', kind: 'task', event: 'completing' }
            ]);
        });

        it('a Camunda connector or a FEEL job type yields no key', () => {
            assert.deepEqual(keys(CAMUNDA_DIALECT.C8, withExtensions(
                executionListeners(['start', 'io.camunda:http-json:1'], ['end', '=jobType'], ['end', '']))), []);
        });

        it('no listeners / no business object → empty', () => {
            assert.deepEqual(keys(CAMUNDA_DIALECT.C8, withExtensions({ $type: 'zeebe:ExecutionListeners' })), []);
            assert.deepEqual(keys(CAMUNDA_DIALECT.C8, undefined), []);
        });

        it('reads no Camunda 7 listener', () => {
            assert.deepEqual(keys(CAMUNDA_DIALECT.C8, withExtensions(
                { $type: 'camunda:ExecutionListener', event: 'start', class: 'AuditDelegate' })), []);
        });
    });
});
