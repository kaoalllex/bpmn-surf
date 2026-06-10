'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope, fixture } = require('./support/scope.js');

// DmnDiffPainter works on the realm's global document,
// so each test gets a fresh scope with the dmn-js table markup.
function createPaintedScope() {
    const scope = createScope();
    scope.document.body.innerHTML = fixture('dmn-table.html');
    return scope;
}

// element.style normalizes colors (hex -> rgb), so compare against
// the same color assigned to a scratch element
function colorOf(document, hex) {
    const el = document.createElement('div');
    el.style.backgroundColor = hex;
    return el.style.backgroundColor;
}

const emptyDiff = {
    headerDiffSelectors: [],
    missingInputIds: [],
    changedInputIds: [],
    missingOutputLabels: [],
    changedOutputLabels: [],
    missingRuleIds: [],
    changedRuleIdToDiffsMap: new Map()
};

describe('DmnDiffPainter.paint', () => {
    it('paints nothing for an empty diff', () => {
        const { DmnDiffPainter, DiffType, document } = createPaintedScope();
        new DmnDiffPainter().paint(emptyDiff, DiffType.ADD);
        for (const el of document.querySelectorAll('*')) {
            assert.equal(el.style.backgroundColor, '');
        }
    });

    it('paints header diffs with the CHANGE color', () => {
        const { DmnDiffPainter, DiffType, document } = createPaintedScope();
        new DmnDiffPainter().paint(
            { ...emptyDiff, headerDiffSelectors: ['div.decision-table-name', 'span.hit-policy-value'] },
            DiffType.ADD
        );
        const changeColor = colorOf(document, DiffType.CHANGE.shapeColor);
        assert.equal(document.querySelector('div.decision-table-name').style.backgroundColor, changeColor);
        assert.equal(document.querySelector('span.hit-policy-value').style.backgroundColor, changeColor);
    });

    it('paints missing input with the given diff type and changed input with CHANGE', () => {
        const { DmnDiffPainter, DiffType, document } = createPaintedScope();
        new DmnDiffPainter().paint(
            { ...emptyDiff, missingInputIds: ['Input_1'] },
            DiffType.REMOVE
        );
        const inputCell = document.querySelector('.input-cell[data-col-id="Input_1"]');
        assert.equal(inputCell.style.backgroundColor, colorOf(document, DiffType.REMOVE.shapeColor));

        new DmnDiffPainter().paint({ ...emptyDiff, changedInputIds: ['Input_1'] }, DiffType.ADD);
        assert.equal(inputCell.style.backgroundColor, colorOf(document, DiffType.CHANGE.shapeColor));
    });

    it('paints output cell parent by label text', () => {
        const { DmnDiffPainter, DiffType, document } = createPaintedScope();
        new DmnDiffPainter().paint(
            { ...emptyDiff, changedOutputLabels: ['Discount'] },
            DiffType.ADD
        );
        const outputHeader = document.querySelector('.output-label').parentElement;
        assert.equal(outputHeader.style.backgroundColor, colorOf(document, DiffType.CHANGE.shapeColor));
    });

    it('paints the whole row of a missing rule', () => {
        const { DmnDiffPainter, DiffType, document } = createPaintedScope();
        new DmnDiffPainter().paint(
            { ...emptyDiff, missingRuleIds: ['Rule_2'] },
            DiffType.ADD
        );
        const ruleRow = document.querySelector('.rule-index[data-row-id="Rule_2"]').parentElement;
        assert.equal(ruleRow.style.backgroundColor, colorOf(document, DiffType.ADD.shapeColor));
    });

    it('paints changed rule cells: entry by data-element-id, description as annotation cell', () => {
        const { DmnDiffPainter, DiffType, document } = createPaintedScope();
        new DmnDiffPainter().paint(
            {
                ...emptyDiff,
                changedRuleIdToDiffsMap: new Map([
                    ['Rule_1', ['UnaryTests_1']],
                    ['Rule_2', ['description']]
                ])
            },
            DiffType.ADD
        );
        const changeColor = colorOf(document, DiffType.CHANGE.shapeColor);
        assert.equal(
            document.querySelector('[data-element-id="UnaryTests_1"]').style.backgroundColor,
            changeColor
        );
        const rule2Row = document.querySelector('.rule-index[data-row-id="Rule_2"]').parentElement;
        assert.equal(rule2Row.querySelector('.cell.annotation').style.backgroundColor, changeColor);
    });

    it('paints diff produced by DmnXmlComparator on fixtures', () => {
        const scope = createPaintedScope();
        const { DmnXmlComparator, DmnDiffPainter, DiffType, document } = scope;
        const diff = new DmnXmlComparator().compare(fixture('changed-rule.dmn'), fixture('base.dmn'));
        new DmnDiffPainter().paint(diff, DiffType.ADD);
        assert.equal(
            document.querySelector('[data-element-id="UnaryTests_1"]').style.backgroundColor,
            colorOf(document, DiffType.CHANGE.shapeColor)
        );
    });
});
