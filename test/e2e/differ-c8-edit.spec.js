'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, C8_ORDER_MAIN_BASE_BPMN
} = require('./support/boot-differ');

// Edit mode on a Camunda 8 diagram goes through the Zeebe panel, and the
// downloaded file keeps the zeebe namespace and its extension elements.
test('edits a job type through the Zeebe panel and downloads it as Camunda 8', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ mode: 'edit', editSide: 'target' }),
        fixtures: { xmlByRef: { 'base-sha': C8_ORDER_MAIN_BASE_BPMN, 'mr-sha': C8_ORDER_MAIN_BASE_BPMN } }
    });

    const validateOrder = page.locator('svg .djs-element[data-element-id="ValidateOrder"]');
    await validateOrder.click();
    const jobType = page.locator('#bio-properties-panel-taskDefinitionType');
    await jobType.fill('validate-order-v2');
    await jobType.blur();

    await expect(validateOrder).toHaveClass(/edit-diff-changed/, { timeout: 5000 });
    const header = page.locator('.bio-properties-panel-group-header').filter({
        has: page.locator('.bio-properties-panel-group-header-title', { hasText: /^Task definition$/ })
    });
    await expect(header).toHaveCSS('background-color', 'rgb(136, 136, 255)', { timeout: 5000 });

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByTitle('Download the edited .bpmn').click()
    ]);
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    const xml = Buffer.concat(chunks).toString('utf8');
    expect(xml).toContain('xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"');
    expect(xml).toMatch(/<zeebe:taskDefinition type="validate-order-v2"/);
    expect(xml).toContain('<zeebe:executionListener eventType="start" retries="3" type="audit-step"');
});
