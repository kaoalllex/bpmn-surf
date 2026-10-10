'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, C8_ORDER_MAIN_BASE_BPMN, C8_ORDER_MAIN_CHANGED_BPMN, BASE_BPMN, CHANGED_FLOW_CONDITION_BPMN
} = require('./support/boot-differ');

// In view mode the differ replaces the panel's own condition field with the
// formatted, diff-coloured condition. The panel re-renders the field on every
// selection and Switch branch; it must be hidden from the moment it is inserted,
// not once the injection runs, or it flashes (with its own syntax colours).
async function nativeFieldShownOnInsert(page, flowId) {
    await page.evaluate(() => {
        window.__shownOnInsert = [];
        new MutationObserver(() => {
            const field = document.querySelector('#bio-properties-panel-conditionExpression');
            if (!field || field.dataset.seen) return;
            field.dataset.seen = '1';
            const box = field.closest('.bio-properties-panel-feel-container') || field;
            window.__shownOnInsert.push(getComputedStyle(box).display !== 'none');
        }).observe(document.body, { childList: true, subtree: true });
    });
    await page.locator(`svg .djs-element[data-element-id="${flowId}"] .djs-hit`).click({ force: true });
    await expect(page.locator('div.properties-condition')).toBeAttached();
    await page.getByRole('button', { name: 'Switch branch' }).click();
    await expect.poll(() => page.evaluate(() => window.__shownOnInsert.length)).toBeGreaterThan(1);
    return page.evaluate(() => window.__shownOnInsert);
}

test('the FEEL condition field never shows before the formatted condition', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: { xmlByRef: { 'base-sha': C8_ORDER_MAIN_BASE_BPMN, 'mr-sha': C8_ORDER_MAIN_CHANGED_BPMN } }
    });
    expect(await nativeFieldShownOnInsert(page, 'Flow_yes')).not.toContain(true);
});

test('the Camunda 7 condition field never shows before the formatted condition', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: { xmlByRef: { 'base-sha': BASE_BPMN, 'mr-sha': CHANGED_FLOW_CONDITION_BPMN } }
    });
    expect(await nativeFieldShownOnInsert(page, 'Flow_2')).not.toContain(true);
});
