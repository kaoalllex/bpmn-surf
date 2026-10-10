'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { CAMUNDA_DIALECT, detectCamundaDialect, isFeelExpression, calledProcessId, calledDecisionId } = createScope();

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
        assert.equal(calledProcessId({ calledElement: 'Sub' }, CAMUNDA_DIALECT.C7), 'Sub');
    });

    it('reads the processId of zeebe:CalledElement in C8', () => {
        assert.equal(calledProcessId(withExtensions(
            { $type: 'zeebe:IoMapping' }, { $type: 'zeebe:CalledElement', processId: 'PaymentC8' }), CAMUNDA_DIALECT.C8),
        'PaymentC8');
    });

    it('does not read the other dialect', () => {
        assert.equal(calledProcessId({ calledElement: 'Sub' }, CAMUNDA_DIALECT.C8), null);
        assert.equal(calledProcessId(withExtensions({ $type: 'zeebe:CalledElement', processId: 'X' }), CAMUNDA_DIALECT.C7),
            null);
    });

    it('reads decisionRef in C7 and the decisionId of zeebe:CalledDecision in C8', () => {
        assert.equal(calledDecisionId({ decisionRef: 'Risk' }, CAMUNDA_DIALECT.C7), 'Risk');
        assert.equal(calledDecisionId(withExtensions({ $type: 'zeebe:CalledDecision', decisionId: 'RiskC8' }),
            CAMUNDA_DIALECT.C8), 'RiskC8');
        assert.equal(calledDecisionId({ decisionRef: 'Risk' }, CAMUNDA_DIALECT.C8), null);
    });

    it('returns a FEEL id as is, for the navigator to decide', () => {
        assert.equal(calledProcessId(withExtensions({ $type: 'zeebe:CalledElement', processId: '=subProcessVar' }),
            CAMUNDA_DIALECT.C8), '=subProcessVar');
    });

    it('is null without a business object or extension elements', () => {
        assert.equal(calledProcessId(null, CAMUNDA_DIALECT.C8), null);
        assert.equal(calledDecisionId({}, CAMUNDA_DIALECT.C8), null);
        assert.equal(calledProcessId(undefined, CAMUNDA_DIALECT.C7), null);
    });
});
