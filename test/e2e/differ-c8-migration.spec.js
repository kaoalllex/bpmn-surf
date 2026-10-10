'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, C8_PAYMENT_C7_BPMN, C8_PAYMENT_MIGRATED_BPMN
} = require('./support/boot-differ');

// A merge request migrating Payment.bpmn from Camunda 7 to 8 in place: the
// differ works in the C8 dialect (one moddle per tab), the comparator works on
// the XML, so both sides open and highlight; the C7 side's camunda:* attributes
// simply stay raw.
test('a 7-vs-8 diff opens on both sides with the Zeebe panel', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: { xmlByRef: { 'base-sha': C8_PAYMENT_C7_BPMN, 'mr-sha': C8_PAYMENT_MIGRATED_BPMN } }
    });

    const chargeCustomer = page.locator('svg .djs-element[data-element-id="ChargeCustomer"]');
    await expect(chargeCustomer.locator('.djs-visual > rect').first()).toHaveCSS('fill', 'rgb(136, 136, 255)');
    await chargeCustomer.click();
    await expect(page.locator('.bio-properties-panel-group-header-title', { hasText: /^Task definition$/ }))
        .toHaveCount(1);

    await page.getByRole('button', { name: 'Switch branch' }).click();
    await expect(chargeCustomer.locator('.djs-visual > rect').first()).toHaveCSS('fill', 'rgb(136, 136, 255)');
    await chargeCustomer.click();
    await expect(page.locator('.bio-properties-panel-group-header-title', { hasText: /^General$/ }))
        .toHaveCount(1);

    expect(pageErrors).toEqual([]);
});
