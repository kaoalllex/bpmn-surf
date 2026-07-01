'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootDmnDiffer, wireDiagnostics, defaultDmnParams, BASE_DMN
} = require('./support/boot-differ');
const { installCapture, getOpenDifferCalls } = require('./support/dive-out-capture');

// J10 (FEAT-0005): the DMN differ also has the dive-out menu. Its caret resolves
// BPMN files that call this decision (DecisionCallerLocator searches decisionRef=).
// Clicking a caller opens the BPMN differ (BPMN msgId, by extension) asking it to
// auto-select the Business Rule Task for this decision id.
test('DMN dive-out lists a BPMN caller and opens it with the decision auto-select hint', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: {
            xmlByRef: { 'mr-sha': BASE_DMN, 'base-sha': BASE_DMN },
            searchHits: [{ path: 'orders/place-order.bpmn', line: 1, snippet: 'decisionRef="Decision_1"' }]
        }
    });
    await installCapture(page);

    await page.locator('.differ-back-caret').click();
    const row = page.locator('.differ-back-menu-item');
    await expect(row).toHaveCount(1);
    await expect(row.locator('.differ-back-menu-name')).toHaveText('place-order.bpmn');
    await row.click();

    await expect.poll(async () => (await getOpenDifferCalls(page)).length).toBe(1);
    const [call] = await getOpenDifferCalls(page);
    expect(call.params.filePath).toBe('orders/place-order.bpmn');
    expect(call.params.fileName).toBe('place-order.bpmn');
    expect(call.params.selectCalledProcessIds).toEqual(['Decision_1']);
    expect(call.msgId).toBe(await page.evaluate(() => BpmnDiffer.MSG_ID)); // .bpmn -> BPMN differ
});
