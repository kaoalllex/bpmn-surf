'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, C8_ORDER_MAIN_BASE_BPMN } = require('./support/boot-differ');

// Edit mode: a FEEL field's "open pop-up editor" button opens the panel's pop-up
// editor, appended to <body>. It must open on top of the differ layout (a fixed,
// full-page element), not under it — there it is invisible while the field says
// "Opened in editor".
test('the FEEL pop-up editor opens on top of the differ', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ mode: 'edit', editSide: 'target' }),
        fixtures: { xmlByRef: { 'base-sha': C8_ORDER_MAIN_BASE_BPMN, 'mr-sha': C8_ORDER_MAIN_BASE_BPMN } }
    });

    await page.locator('svg .djs-element[data-element-id="Flow_yes"] .djs-hit').click({ force: true });
    const field = page.locator('.bio-properties-panel-feel-container:has([id="bio-properties-panel-conditionExpression"])');
    await expect(field).toHaveCount(1);
    await field.hover();
    await field.locator('.bio-properties-panel-open-feel-popup').click();

    const popup = page.locator('.bio-properties-panel-feel-popup');
    await expect(popup).toHaveCount(1);
    const onTop = await popup.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return element.contains(hit);
    });
    expect(onTop).toBe(true);
});
