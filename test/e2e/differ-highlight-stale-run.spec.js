'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, C8_ORDER_MAIN_BASE_BPMN, C8_ORDER_MAIN_CHANGED_BPMN
} = require('./support/boot-differ');

// A group lookup retries for ~1.35 s while the panel does not show the group
// (here: Payment's "Output mapping", hidden on the MR side by
// propagateAllChildVariables="true"). Switching branch meanwhile re-renders the
// panel with that group; the outdated highlight run must stop rather than paint
// the other side's entries into it (it used to look for the MR-only "paymentId"
// on the base side and warn that it was missing).
test('switching branch mid-highlight drops the outdated run', async ({ page }) => {
    const warnings = [];
    page.on('console', (msg) => {
        if (msg.type() === 'warning') warnings.push(msg.text());
    });
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: { xmlByRef: { 'base-sha': C8_ORDER_MAIN_BASE_BPMN, 'mr-sha': C8_ORDER_MAIN_CHANGED_BPMN } }
    });

    await page.locator('svg .djs-element[data-element-id="Payment"]').click();
    await page.getByRole('button', { name: 'Switch branch' }).click();

    const outputMapping = page.locator('.bio-properties-panel-group-header').filter({
        has: page.locator('.bio-properties-panel-group-header-title', { hasText: /^Output mapping$/ })
    });
    await expect(outputMapping).toHaveCSS('background-color', 'rgb(136, 136, 255)');
    await page.waitForTimeout(2000);
    expect(warnings.filter((text) => text.includes('"paymentId" not found'))).toEqual([]);
});
