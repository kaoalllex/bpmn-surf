'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, MESSAGE_CORRELATION_BPMN
} = require('./support/boot-differ');
const { installOpenCapture, getOpenCalls } = require('./support/correlation-open-capture');

const FIXTURES = { xmlByRef: { 'mr-sha': MESSAGE_CORRELATION_BPMN, 'base-sha': MESSAGE_CORRELATION_BPMN } };

// Selecting a message-waiting element (ReceiveTask) shows the ✉→ correlation badge.
test('shows the correlation badge on a selected message receiver', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: defaultBpmnParams(), fixtures: FIXTURES });

    await page.locator('svg .djs-element[data-element-id="ReceiveTask_1"]').click();

    const badge = page.locator('.djs-overlay-note .correlation-link');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', 'Find where this message is correlated in code');
});

// A single correlation hit → jump straight to its blob URL, no dropdown.
test('jumps directly to the single correlation point', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: {
            ...FIXTURES,
            searchHits: [{ path: 'src/OrderListener.kt', line: 14, snippet: 'runtimeService.correlateMessage("OrderPlaced")' }]
        }
    });
    await installOpenCapture(page);

    await page.locator('svg .djs-element[data-element-id="ReceiveTask_1"]').click();
    await page.locator('.djs-overlay-note .correlation-link').click();

    await expect.poll(async () => await getOpenCalls(page)).toEqual(
        ['http://localhost/blob/mr-sha/src/OrderListener.kt#L14']
    );
    // Single result skips the dropdown.
    await expect(page.locator('.correlation-menu')).toBeHidden();
});
