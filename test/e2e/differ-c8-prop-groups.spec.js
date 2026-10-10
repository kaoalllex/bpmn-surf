'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics,
    C8_ORDER_MAIN_BASE_BPMN, C8_ORDER_MAIN_CHANGED_BPMN, C8_PAYMENT_BASE_BPMN, C8_PAYMENT_CHANGED_BPMN,
    C8_DELIVERY_BASE_BPMN, C8_DELIVERY_CHANGED_BPMN, C8_FULFILLMENT_BASE_BPMN, C8_FULFILLMENT_CHANGED_BPMN
} = require('./support/boot-differ');

// Camunda 8: the differ shows the Zeebe properties panel and paints the group a
// zeebe:* change belongs to (the group names are the Zeebe panel's own, so this
// is what pins the comparator's table to the real panel). Material: the
// sandboxes' order-service-c8/ module, main vs c8/model-changes (MR side shown).
const CHANGED = 'rgb(136, 136, 255)';
const ADDED = 'rgb(136, 255, 136)';

const groupHeader = (page, name) => page.locator('.bio-properties-panel-group-header').filter({
    has: page.locator('.bio-properties-panel-group-header-title', { hasText: new RegExp(`^${name}$`) })
});
const element = (page, id) => page.locator(`svg .djs-element[data-element-id="${id}"]`);

async function boot(page, base, changed) {
    const warnings = [];
    page.on('console', (msg) => {
        if (msg.type() === 'warning') warnings.push(msg.text());
    });
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { fixtures: { xmlByRef: { 'base-sha': base, 'mr-sha': changed } } });
    return warnings;
}

async function expectChangedGroups(page, id, groups) {
    await element(page, id).click();
    for (const group of groups) {
        await expect(groupHeader(page, group), `${id}: ${group}`).toHaveCSS('background-color', CHANGED);
    }
}

test('OrderMain: the Zeebe panel and its groups for every change', async ({ page }) => {
    const warnings = await boot(page, C8_ORDER_MAIN_BASE_BPMN, C8_ORDER_MAIN_CHANGED_BPMN);

    await expectChangedGroups(page, 'ValidateOrder', ['Task definition', 'Input mapping', 'Execution listeners']);
    // Input mapping entries are matched by their target, as the panel titles them.
    const addedInput = page.locator('.bio-properties-panel-collapsible-entry-header', {
        has: page.getByText('customerId', { exact: true })
    });
    await expect(addedInput).toHaveCSS('background-color', ADDED);

    // propagateAllChildVariables="true" on this side: the panel shows no Output mapping.
    await expectChangedGroups(page, 'Payment', ['Output propagation']);
    await expectChangedGroups(page, 'AwaitPayment', ['Message']);
    await expectChangedGroups(page, 'NotifyCustomer', ['Headers']);
    const addedHeader = page.locator('.bio-properties-panel-collapsible-entry-header', {
        has: page.getByText('channel', { exact: true })
    });
    await expect(addedHeader).toHaveCSS('background-color', ADDED);

    await page.getByRole('button', { name: 'Switch branch' }).click();
    await expectChangedGroups(page, 'Payment', ['Output propagation', 'Output mapping']);

    expect(warnings.filter((text) => text.includes('property group not found for diff'))).toEqual([]);
});

test('Payment: script, called decision mapping, connector input, retries', async ({ page }) => {
    await boot(page, C8_PAYMENT_BASE_BPMN, C8_PAYMENT_CHANGED_BPMN);

    await expectChangedGroups(page, 'ChargeCustomer', ['Task definition']);
    await expectChangedGroups(page, 'RoundFee', ['Script']);
    await expectChangedGroups(page, 'AssessRisk', ['Input mapping']);
    await expectChangedGroups(page, 'NotifyProvider', ['Input mapping']);
});

test('Delivery: user task form and assignment; a service task turned user task', async ({ page }) => {
    await boot(page, C8_DELIVERY_BASE_BPMN, C8_DELIVERY_CHANGED_BPMN);

    await expectChangedGroups(page, 'PickCourier', ['Form', 'Assignment']);

    await page.getByRole('button', { name: 'Show changes' }).click();
    const row = page.locator('table.changes-table tbody tr', { hasText: 'EscalateDelivery' });
    await expect(row.locator('.changes-table-badge')).toHaveAttribute('title', 'changed');
});

test('Fulfillment: multi-instance, and a change inside a collapsed subprocess', async ({ page }) => {
    await boot(page, C8_FULFILLMENT_BASE_BPMN, C8_FULFILLMENT_CHANGED_BPMN);

    await expectChangedGroups(page, 'PackItems', ['Multi-instance']);
    // DiffType.CHANGE stroke (#0000aa) on the subprocess that hides the change.
    await expect(element(page, 'PrepareDocuments').locator('.djs-visual > rect').first())
        .toHaveCSS('stroke', 'rgb(0, 0, 170)');
});
