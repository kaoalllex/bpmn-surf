'use strict';

// Unit tests for BpmnDifferView.clampPanelWidth — the pure width-clamping
// helper behind the resizable properties splitter (UX-0007). The rest of the
// view is DOM/bpmn-js glue, covered by the manual differ checklist.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { BpmnDifferView } = createScope();
const clamp = BpmnDifferView.clampPanelWidth.bind(BpmnDifferView);

describe('BpmnDifferView.clampPanelWidth', () => {
    it('returns the desired width when it is within [min, max]', () => {
        assert.equal(clamp(400, 250, 800), 400);
    });

    it('clamps up to min when the desired width is below it', () => {
        assert.equal(clamp(100, 250, 800), 250);
    });

    it('clamps down to max when the desired width is above it', () => {
        assert.equal(clamp(1000, 250, 800), 800);
    });

    it('returns min at the lower boundary', () => {
        assert.equal(clamp(250, 250, 800), 250);
    });

    it('returns max at the upper boundary', () => {
        assert.equal(clamp(800, 250, 800), 800);
    });

    it('returns min when max is smaller than min (degenerate window)', () => {
        // e.g. a very narrow window where 80vw < min; min wins.
        assert.equal(clamp(500, 250, 100), 250);
        assert.equal(clamp(50, 250, 100), 250);
    });
});
