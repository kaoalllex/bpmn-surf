'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, defaultBpmnParams,
        CALL_ACTIVITY_IN_BASE_BPMN } = require('./support/boot-differ');

const SAME_ON_BOTH_SIDES = {
    xmlByRef: { 'base-sha': CALL_ACTIVITY_IN_BASE_BPMN, 'mr-sha': CALL_ACTIVITY_IN_BASE_BPMN }
};

const editParams = (overrides = {}) =>
    defaultBpmnParams({ mode: 'edit', editSide: 'target', ...overrides });

// Appends a camunda:in entry to CallActivity_1 through the modeler, exactly as the
// panel's "+" button does — one command on the stack, so the session recomputes.
async function addInMapping(page, target) {
    await page.evaluate((name) => {
        const modeler = window.__bpmnDifferModeler;
        const element = modeler.get('elementRegistry').get('CallActivity_1');
        const extensionElements = element.businessObject.extensionElements;
        const entry = modeler.get('moddle').create('camunda:In', { source: name, target: name });
        entry.$parent = extensionElements;
        modeler.get('modeling').updateModdleProperties(element, extensionElements, {
            values: [...extensionElements.values, entry]
        });
    }, target);
}

// An entry the user ADDED is an addition whichever side is being edited: in edit mode
// the shown diagram is always the newer one, so the "which branch is shown" rule that
// picks add/remove colours in view mode must not apply here.
test('an added list entry is green even when editing the target side', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams(), fixtures: SAME_ON_BOTH_SIDES });

    await addInMapping(page, 'newVar');
    // Select only after the debounced recompute has landed, so this case is about the
    // colour direction and not about the repaint timing the next test covers.
    await expect(page.locator('svg .djs-element[data-element-id="CallActivity_1"]'))
        .toHaveClass(/edit-diff-changed/, { timeout: 5000 });
    await page.locator('svg .djs-element[data-element-id="CallActivity_1"]').click();

    const addedItem = page.locator('.bio-properties-panel-collapsible-entry-header', {
        has: page.getByText('newVar', { exact: true })
    });
    await expect(addedItem).toHaveCSS('background-color', 'rgb(136, 255, 136)', { timeout: 5000 });
});

// The panel colouring is repainted only on selection.changed, so undoing an edit while
// the element stays selected used to leave the group header blue until the user clicked
// the canvas again.
test('undo clears the group highlight without re-selecting the element', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams(), fixtures: SAME_ON_BOTH_SIDES });

    // Edit first, then select: the blue then comes from the selection path, so the undo
    // below is the only thing this case depends on the diff-driven repaint for.
    await addInMapping(page, 'newVar');
    await expect(page.locator('svg .djs-element[data-element-id="CallActivity_1"]'))
        .toHaveClass(/edit-diff-changed/, { timeout: 5000 });
    await page.locator('svg .djs-element[data-element-id="CallActivity_1"]').click();

    const groupHeader = page.locator('.bio-properties-panel-group-header', { hasText: 'In mappings' });
    await expect(groupHeader).toHaveCSS('background-color', 'rgb(136, 136, 255)', { timeout: 5000 });

    await page.evaluate(() => window.__bpmnDifferModeler.get('commandStack').undo());
    await expect(groupHeader).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)', { timeout: 5000 });
});
