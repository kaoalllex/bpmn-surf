'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams,
    C8_ORDER_MAIN_BASE_BPMN, C8_ORDER_MAIN_CHANGED_BPMN
} = require('./support/boot-differ');

// Flow_yes carries a multi-line FEEL condition (`=paid and amount > 0 and (…)`).
// The Zeebe panel renders it in a FEEL editor (CodeMirror, contenteditable, no
// .value) instead of the C7 textarea; the differ hides that editor and draws the
// condition split into one line per `and` / `or` operand.
test('splits a changed FEEL condition into lines and colours the changed ones', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: { xmlByRef: { 'base-sha': C8_ORDER_MAIN_BASE_BPMN, 'mr-sha': C8_ORDER_MAIN_CHANGED_BPMN } }
    });

    await page.locator('svg .djs-element[data-element-id="Flow_yes"] .djs-hit').click({ force: true });

    const condition = page.locator('div.properties-condition');
    await expect(condition).toBeVisible();
    await expect(condition.locator('div', { hasText: /^=paid and$/ })).toHaveCount(1);
    await expect(condition.locator('div', { hasText: /^not\(fraudSuspected\) and$/ }))
        .toHaveCSS('background-color', 'rgb(136, 255, 136)');
    await expect(condition.locator('div', { hasText: /loyaltyYears >= 1/ }))
        .toHaveCSS('background-color', 'rgb(136, 255, 136)');
    // The FEEL editor itself is hidden, not left beside the formatted block (counted
    // first: a missing element would pass toBeHidden too).
    const feelEditor = page.locator('.bio-properties-panel-feel-container:has([id="bio-properties-panel-conditionExpression"])');
    await expect(feelEditor).toHaveCount(1);
    await expect(feelEditor).toBeHidden();
});

// No version to compare with: the condition text comes from the panel field,
// which in the Zeebe panel has no .value.
test('formats an unchanged FEEL condition in branch view', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ sourceRef: null, sourceLabel: null }),
        fixtures: { xmlByRef: { 'base-sha': C8_ORDER_MAIN_BASE_BPMN } }
    });

    await page.locator('svg .djs-element[data-element-id="Flow_yes"] .djs-hit').click({ force: true });

    const condition = page.locator('div.properties-condition');
    await expect(condition).toBeAttached();
    await expect(condition.locator('div', { hasText: /^=paid and$/ })).toHaveCount(1);
    expect(pageErrors).toEqual([]);
});
