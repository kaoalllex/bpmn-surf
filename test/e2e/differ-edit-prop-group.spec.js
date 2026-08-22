'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, defaultBpmnParams,
        BASE_BPMN, CALL_ACTIVITY_IN_BASE_BPMN } = require('./support/boot-differ');

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

// Replacing an element's type names no property group, so the panel used to say
// nothing while the canvas went blue. The panel shows the type in its header —
// that is what carries the 'changed' colour.
test('replacing the element type paints the type in the panel header', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ mode: 'edit', editSide: 'source', targetRef: 'mr-sha' }),
        fixtures: { xmlByRef: { 'base-sha': BASE_BPMN, 'mr-sha': BASE_BPMN } }
    });

    await page.evaluate(() => {
        const modeler = window.__bpmnDifferModeler;
        const element = modeler.get('elementRegistry').get('Task_1');
        modeler.get('bpmnReplace').replaceElement(element, { type: 'bpmn:ServiceTask' });
    });
    await expect(page.locator('svg .djs-element[data-element-id="Task_1"]'))
        .toHaveClass(/edit-diff-changed/, { timeout: 5000 });
    // Select through the selection service: replaceElement swaps the shape's DOM node,
    // so a click can land on the canvas instead of the freshly rendered element.
    await page.evaluate(() => {
        const modeler = window.__bpmnDifferModeler;
        modeler.get('selection').select(modeler.get('elementRegistry').get('Task_1'));
    });

    const headerType = page.locator('.bio-properties-panel-header-type');
    await expect(headerType).toHaveText('Service Task');
    await expect(headerType).toHaveCSS('background-color', 'rgb(136, 136, 255)', { timeout: 5000 });
});

// Extension properties is a list group like the mappings: the panel labels each entry by
// its name, so an added entry gets its own colour and not only the group header.
test('added extension properties are painted individually', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams(), fixtures: SAME_ON_BOTH_SIDES });

    await page.locator('svg .djs-element[data-element-id="CallActivity_1"]').click();
    // Open the group first: the highlighter can only paint entries that are rendered,
    // and in edit mode nothing auto-expands the groups the user is editing.
    const groupHeader = page.locator('.bio-properties-panel-group-header',
        { hasText: 'Extension properties' });
    await groupHeader.click();

    await page.evaluate(() => {
        const modeler = window.__bpmnDifferModeler;
        const moddle = modeler.get('moddle');
        const element = modeler.get('elementRegistry').get('CallActivity_1');
        const extensionElements = element.businessObject.extensionElements;
        const container = moddle.create('camunda:Properties', {
            values: [
                moddle.create('camunda:Property', { name: 'propA', value: '1' }),
                moddle.create('camunda:Property', { name: 'propB', value: '2' })
            ]
        });
        container.$parent = extensionElements;
        modeler.get('modeling').updateModdleProperties(element, extensionElements, {
            values: [...extensionElements.values, container]
        });
    });

    await expect(groupHeader).toHaveCSS('background-color', 'rgb(136, 136, 255)', { timeout: 5000 });
    for (const name of ['propA', 'propB']) {
        const item = page.locator('.bio-properties-panel-collapsible-entry-header', {
            has: page.getByText(name, { exact: true })
        });
        await expect(item).toHaveCSS('background-color', 'rgb(136, 255, 136)', { timeout: 5000 });
    }
});
