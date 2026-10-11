'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics,
    C7_ORDER_MAIN_BASE_BPMN, C7_ORDER_MAIN_CHANGED_BPMN, C7_PAYMENT_BASE_BPMN, C7_PAYMENT_CHANGED_BPMN,
    C7_DELIVERY_BASE_BPMN, C7_DELIVERY_CHANGED_BPMN, C7_BILLING_BASE_BPMN, C7_BILLING_CHANGED_BPMN
} = require('./support/boot-differ');

// Camunda 7: the differ paints the properties-panel group a camunda:* change belongs
// to. The group names are the Camunda 7 panel's own, so this is what pins the
// comparator's table to the real panel — the twin of differ-c8-prop-groups.spec.js.
// Material: the sandboxes' main vs c7/model-changes (MR side shown).
const CHANGED = 'rgb(136, 136, 255)';
const ADDED = 'rgb(136, 255, 136)';

const groupHeader = (page, name) => page.locator('.bio-properties-panel-group-header').filter({
    has: page.locator('.bio-properties-panel-group-header-title', { hasText: new RegExp(`^${name}$`) })
});
const element = (page, id) => page.locator(`svg .djs-element[data-element-id="${id}"]`);
const entryHeader = (page, label) => page.locator('.bio-properties-panel-collapsible-entry-header', {
    has: page.getByText(label, { exact: true })
});

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
    await element(page, id).click({ force: true });
    for (const group of groups) {
        await expect(groupHeader(page, group), `${id}: ${group}`).toHaveCSS('background-color', CHANGED);
    }
}

const unmapped = (warnings) => warnings.filter((text) => text.includes('property group not found for diff'));

test('OrderMain: listeners, async, In mappings, Inputs, extension properties, task priority, condition', async ({ page }) => {
    const warnings = await boot(page, C7_ORDER_MAIN_BASE_BPMN, C7_ORDER_MAIN_CHANGED_BPMN);

    await expectChangedGroups(page, 'ValidateOrder', ['Execution listeners']);
    await expectChangedGroups(page, 'CheckFraud', ['Asynchronous continuations']);
    await expectChangedGroups(page, 'Fulfillment', ['In mappings']);
    await expect(entryHeader(page, 'priority')).toHaveCSS('background-color', ADDED);
    await expectChangedGroups(page, 'NotifyCustomer', ['Inputs', 'Extension properties']);
    await expect(entryHeader(page, 'channel')).toHaveCSS('background-color', ADDED);
    await expectChangedGroups(page, 'CancelOrder', ['External task']);
    await expectChangedGroups(page, 'Flow_om7', ['Condition']);

    expect(unmapped(warnings)).toEqual([]);
});

test('Payment: job execution and Out mappings', async ({ page }) => {
    const warnings = await boot(page, C7_PAYMENT_BASE_BPMN, C7_PAYMENT_CHANGED_BPMN);

    await expectChangedGroups(page, 'ChargeCustomer', ['Asynchronous continuations', 'Job execution']);
    await expectChangedGroups(page, 'Dunning', ['Out mappings']);

    expect(unmapped(warnings)).toEqual([]);
});

test('Delivery: user assignment, form, task listener, multi-instance', async ({ page }) => {
    const warnings = await boot(page, C7_DELIVERY_BASE_BPMN, C7_DELIVERY_CHANGED_BPMN);

    await expectChangedGroups(page, 'PickCourier', ['User assignment', 'Forms', 'Task listeners']);
    await expectChangedGroups(page, 'FindItems', ['Multi-instance']);

    expect(unmapped(warnings)).toEqual([]);
});

test('Billing: a field injection of a delegate', async ({ page }) => {
    const warnings = await boot(page, C7_BILLING_BASE_BPMN, C7_BILLING_CHANGED_BPMN);

    await expectChangedGroups(page, 'IssueInvoice', ['Field injections']);
    await expect(groupHeader(page, 'Implementation')).not.toHaveCSS('background-color', CHANGED);

    expect(unmapped(warnings)).toEqual([]);
});
