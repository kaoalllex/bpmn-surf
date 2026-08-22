'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope, fixture, mapToObject } = require('#scope');

const { DmnXmlComparator } = createScope();

const base = fixture('base.dmn');
const addedRule = fixture('added-rule.dmn');
const changedHeader = fixture('changed-header.dmn');
const changedInput = fixture('changed-input.dmn');
const changedOutputLabel = fixture('changed-output-label.dmn');
const changedRule = fixture('changed-rule.dmn');

function compare(myXml, otherXml) {
    return new DmnXmlComparator().compare(myXml, otherXml);
}

describe('DmnXmlComparator.compare', () => {
    it('finds no diffs for identical documents', () => {
        const result = compare(base, base);
        assert.deepEqual(Array.from(result.headerDiffSelectors), []);
        assert.deepEqual(Array.from(result.missingInputIds), []);
        assert.deepEqual(Array.from(result.changedInputIds), []);
        assert.deepEqual(Array.from(result.missingOutputLabels), []);
        assert.deepEqual(Array.from(result.changedOutputLabels), []);
        assert.deepEqual(Array.from(result.missingRuleIds), []);
        assert.equal(result.changedRuleIdToDiffsMap.size, 0);
    });

    it('detects added rule as missing in the other version', () => {
        const result = compare(addedRule, base);
        assert.deepEqual(Array.from(result.missingRuleIds), ['Rule_3']);
        assert.equal(result.changedRuleIdToDiffsMap.size, 0);
    });

    it('reverse direction of added rule is clean', () => {
        const result = compare(base, addedRule);
        assert.deepEqual(Array.from(result.missingRuleIds), []);
        assert.equal(result.changedRuleIdToDiffsMap.size, 0);
    });

    it('detects changed decision name and hit policy as header diff selectors', () => {
        const result = compare(changedHeader, base);
        assert.deepEqual(Array.from(result.headerDiffSelectors), [
            'div.decision-table-name',
            'span.hit-policy-value'
        ]);
    });

    it('detects changed input expression', () => {
        const result = compare(changedInput, base);
        assert.deepEqual(Array.from(result.changedInputIds), ['Input_1']);
        assert.deepEqual(Array.from(result.missingInputIds), []);
    });

    it('detects changed output label (reports my label)', () => {
        const result = compare(changedOutputLabel, base);
        assert.deepEqual(Array.from(result.changedOutputLabels), ['Rebate']);
        assert.deepEqual(Array.from(result.missingOutputLabels), []);
    });

    it('detects changed rule entries and descriptions per rule', () => {
        const result = compare(changedRule, base);
        assert.deepEqual(Array.from(result.missingRuleIds), []);
        assert.deepEqual(mapToObject(result.changedRuleIdToDiffsMap), {
            Rule_1: ['UnaryTests_1'],
            Rule_2: ['description']
        });
    });
});

// Inputs, outputs and rule entries are matched as serialised markup, so a file
// that is only indented differently would otherwise read as changed everywhere.
const compact = (xml) => xml.replace(/>\s+</g, '><');

describe('DmnXmlComparator document indentation', () => {
    it('finds no diffs between a compact document and its indented twin', () => {
        const result = compare(compact(base), base);
        assert.deepEqual(Array.from(result.headerDiffSelectors), []);
        assert.deepEqual(Array.from(result.changedInputIds), []);
        assert.deepEqual(Array.from(result.changedOutputLabels), []);
        assert.deepEqual(Array.from(result.missingRuleIds), []);
        assert.equal(result.changedRuleIdToDiffsMap.size, 0);
    });

    it('still detects a real change between differently indented documents', () => {
        const result = compare(compact(changedRule), base);
        assert.deepEqual(mapToObject(result.changedRuleIdToDiffsMap), {
            Rule_1: ['UnaryTests_1'],
            Rule_2: ['description']
        });
    });

    it('still detects a changed input expression between the two forms', () => {
        const result = compare(compact(changedInput), base);
        assert.deepEqual(Array.from(result.changedInputIds), ['Input_1']);
    });
});
