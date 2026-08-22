'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope, fixture } = require('#scope');

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

function createHighlighter(scope, { isBaseSideShown = () => false } = {}) {
    const highlighter = new scope.PropertiesPanelHighlighter(
        new scope.ConditionFormatter(),
        isBaseSideShown
    );
    return highlighter;
}

function groupHeader(document, title) {
    return document.querySelector(`.bio-properties-panel-group-header-title[title="${title}"]`).parentElement;
}

// The collapsible-entry header of a list item, matched by its label text
function listItemHeader(document, label) {
    const titles = document.querySelectorAll('.bio-properties-panel-collapsible-entry-header-title');
    for (const title of titles) {
        if (title.textContent.trim() === label) {
            return title.parentElement;
        }
    }
    return null;
}

const sequenceFlowRegistry = { get: () => ({ type: 'bpmn:SequenceFlow' }) };

describe('PropertiesPanelHighlighter.highlightDiffPropGroups', () => {
    // A replaced element type names no property group, so without this the element
    // would go blue on the canvas with nothing in the panel saying what changed.
    it('paints the header type when the element type changed', async () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope);
        highlighter.setDiffData(new Map(), new Map(), new Map(), ['Task_1']);

        await highlighter.highlightDiffPropGroups('Task_1');

        const typeElem = scope.document.querySelector('.bio-properties-panel-header-type');
        assert.equal(typeElem.style.backgroundColor, colorOf(scope.document, HIGHLIGHT_COLOR));
    });

    it('leaves the header type alone for an element whose type did not change', async () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope);
        highlighter.setDiffData(new Map([['Task_1', ['General']]]), new Map(), new Map(), ['Other_1']);

        await highlighter.highlightDiffPropGroups('Task_1');

        const typeElem = scope.document.querySelector('.bio-properties-panel-header-type');
        assert.equal(typeElem.style.backgroundColor, '');
    });

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

describe('PropertiesPanelHighlighter.highlightDiffPropGroups list group entries', () => {
    function mappingChanges(entries) {
        return new Map([['Task_1', new Map([['In mappings', entries]])]]);
    }

    it('highlights a changed list entry with the change color and still highlights the group', async () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope);
        highlighter.setDiffData(
            new Map([['Task_1', ['In mappings']]]),
            new Map(),
            mappingChanges([{ label: 'itemId', changed: true }])
        );

        await highlighter.highlightDiffPropGroups('Task_1');

        assert.equal(
            groupHeader(scope.document, 'In mappings').style.backgroundColor,
            colorOf(scope.document, HIGHLIGHT_COLOR)
        );
        assert.equal(
            listItemHeader(scope.document, 'itemId').style.backgroundColor,
            colorOf(scope.document, HIGHLIGHT_COLOR)
        );
        // The untouched entry stays clean
        assert.equal(listItemHeader(scope.document, 'varIn').style.backgroundColor, '');
    });

    it('paints an added entry (only in the shown version) with the add color when the MR branch is shown', async () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope, { isBaseSideShown: () => false });
        highlighter.setDiffData(
            new Map([['Task_1', ['In mappings']]]),
            new Map(),
            mappingChanges([{ label: 'varIn', changed: false }])
        );

        await highlighter.highlightDiffPropGroups('Task_1');

        assert.equal(
            listItemHeader(scope.document, 'varIn').style.backgroundColor,
            colorOf(scope.document, MR_ADD_COLOR)
        );
    });

    it('paints a removed entry (only in the shown version) with the remove color when the target branch is shown', async () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope, { isBaseSideShown: () => true });
        highlighter.setDiffData(
            new Map([['Task_1', ['In mappings']]]),
            new Map(),
            mappingChanges([{ label: 'varIn', changed: false }])
        );

        await highlighter.highlightDiffPropGroups('Task_1');

        assert.equal(
            listItemHeader(scope.document, 'varIn').style.backgroundColor,
            colorOf(scope.document, BRANCH_REMOVE_COLOR)
        );
    });

    it('highlights only the group when there are no entry descriptors (fallback)', async () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope);
        highlighter.setDiffData(new Map([['Task_1', ['In mappings']]]), new Map(), new Map());

        await highlighter.highlightDiffPropGroups('Task_1');

        assert.equal(
            groupHeader(scope.document, 'In mappings').style.backgroundColor,
            colorOf(scope.document, HIGHLIGHT_COLOR)
        );
        assert.equal(listItemHeader(scope.document, 'varIn').style.backgroundColor, '');
        assert.equal(listItemHeader(scope.document, 'itemId').style.backgroundColor, '');
    });

    it('highlights the group even when a described entry is absent from the panel', async () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope);
        highlighter.setDiffData(
            new Map([['Task_1', ['In mappings']]]),
            new Map(),
            mappingChanges([{ label: 'businessKeyVar', changed: false }])
        );

        await highlighter.highlightDiffPropGroups('Task_1');

        assert.equal(
            groupHeader(scope.document, 'In mappings').style.backgroundColor,
            colorOf(scope.document, HIGHLIGHT_COLOR)
        );
    });

    it('waits for list entries that render after selection (async panel render)', async () => {
        // BUG-0011 regression: the panel re-renders its list entries a tick after
        // the group header. Highlighting must wait for them instead of querying once.
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope);
        highlighter.setDiffData(
            new Map([['Task_1', ['In mappings']]]),
            new Map(),
            mappingChanges([{ label: 'itemId', changed: true }])
        );

        // Detach the list entries, then re-attach them shortly after highlighting
        // starts, mimicking the deferred preact render.
        const group = groupHeader(scope.document, 'In mappings').parentElement;
        const list = group.querySelector('.bio-properties-panel-list');
        const detached = list.innerHTML;
        list.innerHTML = '';
        scope.window.setTimeout(() => { list.innerHTML = detached; }, 60);

        await highlighter.highlightDiffPropGroups('Task_1');

        assert.equal(
            listItemHeader(scope.document, 'itemId').style.backgroundColor,
            colorOf(scope.document, HIGHLIGHT_COLOR)
        );
    });

    it('resets entry highlights when another element is selected', async () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope);
        highlighter.setDiffData(
            new Map([['Task_1', ['In mappings']]]),
            new Map(),
            mappingChanges([{ label: 'itemId', changed: true }])
        );

        await highlighter.highlightDiffPropGroups('Task_1');
        await highlighter.highlightDiffPropGroups('ElementWithoutDiffs');

        assert.equal(groupHeader(scope.document, 'In mappings').style.backgroundColor, '');
        assert.equal(listItemHeader(scope.document, 'itemId').style.backgroundColor, '');
    });
});

describe('PropertiesPanelHighlighter.showConditionExpression', () => {
    it('hides the native expression container and renders formatted condition parts', async () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope);
        highlighter.init(sequenceFlowRegistry);
        highlighter.setDiffData(new Map(), new Map([['Flow_1', ['${a && b}', '${a}']]]));

        await highlighter.showConditionExpression('Flow_1');

        const native = scope.document.querySelector('#bio-properties-panel-conditionExpression');
        assert.equal(native.style.display, 'none');

        const container = scope.document.querySelector('.properties-condition');
        const parts = Array.from(container.children).map(el => el.textContent);
        assert.deepEqual(parts, ['${', '  a &&', '  b', '}']);
    });

    it('marks parts missing in the other branch with the add color when the MR branch is shown', async () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope, { isBaseSideShown: () => false });
        highlighter.init(sequenceFlowRegistry);
        highlighter.setDiffData(new Map(), new Map([['Flow_1', ['${a && b}', '${a}']]]));

        await highlighter.showConditionExpression('Flow_1');

        const colors = Array.from(scope.document.querySelector('.properties-condition').children)
            .map(el => el.style.backgroundColor);
        const added = colorOf(scope.document, MR_ADD_COLOR);
        // '${' and '}' exist in both versions, 'a &&' and 'b' only in the shown one
        assert.deepEqual(colors, ['', added, added, '']);
    });

    it('marks parts missing in the other branch with the remove color when the target branch is shown', async () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope, { isBaseSideShown: () => true });
        highlighter.init(sequenceFlowRegistry);
        highlighter.setDiffData(new Map(), new Map([['Flow_1', ['${a && b}', '${a}']]]));

        await highlighter.showConditionExpression('Flow_1');

        const colors = Array.from(scope.document.querySelector('.properties-condition').children)
            .map(el => el.style.backgroundColor);
        const removed = colorOf(scope.document, BRANCH_REMOVE_COLOR);
        assert.deepEqual(colors, ['', removed, removed, '']);
    });

    it('renders the native textarea value without colors when the flow has no condition diff', async () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope);
        highlighter.init(sequenceFlowRegistry);
        highlighter.setDiffData(new Map(), new Map());

        await highlighter.showConditionExpression('Flow_1');

        const container = scope.document.querySelector('.properties-condition');
        const parts = Array.from(container.children).map(el => el.textContent);
        assert.deepEqual(parts, ['${', '  approved == true', '}']);
        for (const el of container.children) {
            assert.equal(el.style.backgroundColor, '');
        }
    });

    it('replaces the previous condition container on a repeated call', async () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope);
        highlighter.init(sequenceFlowRegistry);
        highlighter.setDiffData(new Map(), new Map([['Flow_1', ['${a && b}', '${a}']]]));

        await highlighter.showConditionExpression('Flow_1');
        await highlighter.showConditionExpression('Flow_1');

        assert.equal(scope.document.querySelectorAll('.properties-condition').length, 1);
    });

    it('does nothing for a non sequence flow element', async () => {
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope);
        highlighter.init({ get: () => ({ type: 'bpmn:ServiceTask' }) });
        highlighter.setDiffData(new Map(), new Map());

        await highlighter.showConditionExpression('Task_1');

        const native = scope.document.querySelector('#bio-properties-panel-conditionExpression');
        assert.equal(native.style.display, '');
        assert.equal(scope.document.querySelector('.properties-condition'), null);
    });

    it('waits for the condition input to render after selection (async panel render)', async () => {
        // BUG-0011 regression: the condition input renders a tick after selection,
        // so formatting must wait for it instead of querying once.
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope);
        highlighter.init(sequenceFlowRegistry);
        highlighter.setDiffData(new Map(), new Map([['Flow_1', ['${a && b}', '${a}']]]));

        // Detach the native condition input, then re-attach it shortly after the
        // call starts, mimicking the deferred preact render.
        const native = scope.document.querySelector('#bio-properties-panel-conditionExpression');
        const parent = native.parentElement;
        parent.removeChild(native);
        scope.window.setTimeout(() => { parent.appendChild(native); }, 60);

        await highlighter.showConditionExpression('Flow_1');

        const container = scope.document.querySelector('.properties-condition');
        const parts = Array.from(container.children).map(el => el.textContent);
        assert.deepEqual(parts, ['${', '  a &&', '  b', '}']);
    });

    it('re-injects the formatted condition if the panel strips it during re-render', async () => {
        // BUG-0011 regression: selecting another sequence flow re-renders the panel
        // (preact), which strips the foreign condition block we inject. The method
        // must re-inject until the block survives.
        const scope = createPanelScope();
        const highlighter = createHighlighter(scope);
        highlighter.init(sequenceFlowRegistry);
        highlighter.setDiffData(new Map(), new Map([['Flow_1', ['${a && b}', '${a}']]]));

        // Strip the injected block once, right after it first appears, simulating
        // the panel's reconciliation removing it.
        let stripped = false;
        const watcher = scope.window.setInterval(() => {
            const div = scope.document.querySelector('.properties-condition');
            if (div && !stripped) {
                div.remove();
                stripped = true;
            }
        }, 10);

        await highlighter.showConditionExpression('Flow_1');
        scope.window.clearInterval(watcher);

        assert.ok(stripped, 'the simulated strip should have occurred');
        const container = scope.document.querySelector('.properties-condition');
        assert.ok(container, 'condition block should be re-injected after being stripped');
        const parts = Array.from(container.children).map(el => el.textContent);
        assert.deepEqual(parts, ['${', '  a &&', '  b', '}']);
    });
});
