'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope, fixture } = require('./support/scope.js');

// PropertiesPanelHighlighter works on the realm's global document,
// so each test gets a fresh scope with the properties panel markup.
function createPanelScope() {
    const scope = createScope();
    scope.document.body.innerHTML = fixture('properties-panel.html');
    return scope;
}

// element.style normalizes colors (hex -> rgb), so compare against
// the same color assigned to a scratch element
function colorOf(document, hex) {
    const el = document.createElement('div');
    el.style.backgroundColor = hex;
    return el.style.backgroundColor;
}

const HIGHLIGHT_COLOR = '#8888ff';
const BRANCH_REMOVE_COLOR = '#ff8888';
const MR_ADD_COLOR = '#88ff88';

function createHighlighter(scope, { isTargetBranchShown = () => false } = {}) {
    const highlighter = new scope.PropertiesPanelHighlighter(
        new scope.ConditionFormatter(),
        isTargetBranchShown
    );
    return highlighter;
}

function groupHeader(document, title) {
    return document.querySelector(`.bio-properties-panel-group-header-title[title="${title}"]`).parentElement;
}

const sequenceFlowRegistry = { get: () => ({ type: 'bpmn:SequenceFlow' }) };

describe('PropertiesPanelHighlighter.highlightDiffPropGroups', () => {
    it('paints exactly the groups listed for the element', async () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope);
        highlighter.setDiffData(
            new Map([['Task_1', ['General', 'Asynchronous continuations']]]),
            new Map()
        );

        await highlighter.highlightDiffPropGroups('Task_1');

        const highlight = colorOf(scope.document, HIGHLIGHT_COLOR);
        assert.equal(groupHeader(scope.document, 'General').style.backgroundColor, highlight);
        assert.equal(groupHeader(scope.document, 'Asynchronous continuations').style.backgroundColor, highlight);
        assert.equal(groupHeader(scope.document, 'Condition').style.backgroundColor, '');
    });

    it('resets the previous highlight when another element is selected', async () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope);
        highlighter.setDiffData(
            new Map([
                ['Task_1', ['General']],
                ['Flow_1', ['Condition']]
            ]),
            new Map()
        );

        await highlighter.highlightDiffPropGroups('Task_1');
        await highlighter.highlightDiffPropGroups('Flow_1');

        assert.equal(groupHeader(scope.document, 'General').style.backgroundColor, '');
        assert.equal(
            groupHeader(scope.document, 'Condition').style.backgroundColor,
            colorOf(scope.document, HIGHLIGHT_COLOR)
        );
    });

    it('paints nothing for an element without diffs and resets the previous highlight', async () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope);
        highlighter.setDiffData(new Map([['Task_1', ['General']]]), new Map());

        await highlighter.highlightDiffPropGroups('Task_1');
        await highlighter.highlightDiffPropGroups('ElementWithoutDiffs');

        for (const el of scope.document.querySelectorAll('*')) {
            assert.equal(el.style.backgroundColor, '');
        }
    });
});

describe('PropertiesPanelHighlighter.showConditionExpression', () => {
    it('hides the native expression container and renders formatted condition parts', () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope);
        highlighter.init(sequenceFlowRegistry);
        highlighter.setDiffData(new Map(), new Map([['Flow_1', ['${a && b}', '${a}']]]));

        highlighter.showConditionExpression('Flow_1');

        const native = scope.document.querySelector('#bio-properties-panel-conditionExpression');
        assert.equal(native.style.display, 'none');

        const container = scope.document.querySelector('.properties-condition');
        const parts = Array.from(container.children).map(el => el.textContent);
        assert.deepEqual(parts, ['${', '  a &&', '  b', '}']);
    });

    it('marks parts missing in the other branch with the add color when the MR branch is shown', () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope, { isTargetBranchShown: () => false });
        highlighter.init(sequenceFlowRegistry);
        highlighter.setDiffData(new Map(), new Map([['Flow_1', ['${a && b}', '${a}']]]));

        highlighter.showConditionExpression('Flow_1');

        const colors = Array.from(scope.document.querySelector('.properties-condition').children)
            .map(el => el.style.backgroundColor);
        const added = colorOf(scope.document, MR_ADD_COLOR);
        // '${' and '}' exist in both versions, 'a &&' and 'b' only in the shown one
        assert.deepEqual(colors, ['', added, added, '']);
    });

    it('marks parts missing in the other branch with the remove color when the target branch is shown', () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope, { isTargetBranchShown: () => true });
        highlighter.init(sequenceFlowRegistry);
        highlighter.setDiffData(new Map(), new Map([['Flow_1', ['${a && b}', '${a}']]]));

        highlighter.showConditionExpression('Flow_1');

        const colors = Array.from(scope.document.querySelector('.properties-condition').children)
            .map(el => el.style.backgroundColor);
        const removed = colorOf(scope.document, BRANCH_REMOVE_COLOR);
        assert.deepEqual(colors, ['', removed, removed, '']);
    });

    it('renders the native textarea value without colors when the flow has no condition diff', () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope);
        highlighter.init(sequenceFlowRegistry);
        highlighter.setDiffData(new Map(), new Map());

        highlighter.showConditionExpression('Flow_1');

        const container = scope.document.querySelector('.properties-condition');
        const parts = Array.from(container.children).map(el => el.textContent);
        assert.deepEqual(parts, ['${', '  approved == true', '}']);
        for (const el of container.children) {
            assert.equal(el.style.backgroundColor, '');
        }
    });

    it('replaces the previous condition container on a repeated call', () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope);
        highlighter.init(sequenceFlowRegistry);
        highlighter.setDiffData(new Map(), new Map([['Flow_1', ['${a && b}', '${a}']]]));

        highlighter.showConditionExpression('Flow_1');
        highlighter.showConditionExpression('Flow_1');

        assert.equal(scope.document.querySelectorAll('.properties-condition').length, 1);
    });

    it('does nothing for a non sequence flow element', () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope);
        highlighter.init({ get: () => ({ type: 'bpmn:ServiceTask' }) });
        highlighter.setDiffData(new Map(), new Map());

        highlighter.showConditionExpression('Task_1');

        const native = scope.document.querySelector('#bio-properties-panel-conditionExpression');
        assert.equal(native.style.display, '');
        assert.equal(scope.document.querySelector('.properties-condition'), null);
    });
});
