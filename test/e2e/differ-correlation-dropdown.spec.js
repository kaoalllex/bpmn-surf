'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, MESSAGE_CORRELATION_BPMN
} = require('./support/boot-differ');
const { installOpenCapture, getOpenCalls } = require('./support/correlation-open-capture');

// Two correlation points → a dropdown listing both as "fileName:line" rows;
// clicking a row jumps to that hit's blob URL.
test('lists multiple correlation points in a dropdown and opens the chosen one', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: {
            xmlByRef: { 'mr-sha': MESSAGE_CORRELATION_BPMN, 'base-sha': MESSAGE_CORRELATION_BPMN },
            searchHits: [
                { path: 'src/OrderListener.kt', line: 14, snippet: 'correlateMessage("OrderPlaced")' },
                { path: 'src/OrderSaga.kt', line: 30, snippet: 'correlateMessage("OrderPlaced")' }
            ]
        }
    });
    await installOpenCapture(page);

    await page.locator('svg .djs-element[data-element-id="ReceiveTask_1"]').click();
    await page.locator('.djs-overlay-note .correlation-link').click();

    const menu = page.locator('.correlation-menu');
    await expect(menu).toBeVisible();
    const items = menu.locator('.differ-back-menu-item');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0).locator('.differ-back-menu-name')).toHaveText('OrderListener.kt:14');
    await expect(items.nth(1).locator('.differ-back-menu-name')).toHaveText('OrderSaga.kt:30');

    await items.nth(1).click();
    await expect.poll(async () => await getOpenCalls(page)).toEqual(
        ['http://localhost/blob/mr-sha/src/OrderSaga.kt#L30']
    );
});
