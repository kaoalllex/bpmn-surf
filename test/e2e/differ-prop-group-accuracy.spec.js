'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, defaultBpmnParams } = require('./support/boot-differ');

// UX-0004 in the real panel: a changed error code (defined outside the process), the
// multi-instance body's own retry cycle, and a start event's isInterrupting each paint
// the panel part where the user sees the change.
const BASE = fs.readFileSync(path.join(__dirname, 'fixtures', 'prop-group-accuracy.bpmn'), 'utf8');
const CHANGED = BASE
    .replace('errorCode="PAYMENT_FAILED"', 'errorCode="PAYMENT_DECLINED"')
    .replace('R3/PT1M', 'R5/PT1M')
    .replace(' isInterrupting="false"', '');

const BLUE = 'rgb(136, 136, 255)';

test.beforeEach(async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'base-sha': BASE, 'mr-sha': CHANGED } }
    });
    await expect(page.locator('.bio-properties-panel-scroll-container')).toBeVisible();
});

const groupHeader = (page, title) =>
    page.locator('.bio-properties-panel-group-header', { hasText: title });

test('a changed error code paints Error on the boundary event and Errors on the external task', async ({ page }) => {
    await page.locator('svg .djs-element[data-element-id="ErrorBoundaryEvent_1"]').click();
    await expect(groupHeader(page, 'Error')).toHaveCSS('background-color', BLUE);

    await page.locator('svg .djs-element[data-element-id="ExternalTask_1"]').click();
    await expect(groupHeader(page, 'Errors')).toHaveCSS('background-color', BLUE);
});

test('the multi-instance body\'s retry cycle paints Multi-instance', async ({ page }) => {
    await page.locator('svg .djs-element[data-element-id="MultiTask_1"]').click();
    await expect(groupHeader(page, 'Multi-instance')).toHaveCSS('background-color', BLUE);
});

test('a start event\'s isInterrupting paints the panel header type', async ({ page }) => {
    await page.locator('svg .djs-element[data-element-id="MessageStartEvent_1"]').click();
    await expect(page.locator('.bio-properties-panel-header-type')).toHaveCSS('background-color', BLUE);
});
