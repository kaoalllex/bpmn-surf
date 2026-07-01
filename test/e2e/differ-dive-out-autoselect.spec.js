'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams,
    CALL_ACTIVITY_BPMN, BUSINESS_RULE_TASK_BPMN
} = require('./support/boot-differ');

// J8: a caller opened by diving out carries selectCalledProcessIds. On render the
// differ auto-selects the Call Activity whose calledElement matches (no user click) —
// the call site is "highlighted": its dive-in badge overlay appears.
test('auto-selects the Call Activity for selectCalledProcessIds on open', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ selectCalledProcessIds: ['Sub_Process'] }),
        fixtures: { xmlByRef: { 'mr-sha': CALL_ACTIVITY_BPMN, 'base-sha': CALL_ACTIVITY_BPMN } }
    });

    const badge = page.locator('.djs-overlay-note .dive-in-call-activity');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', 'Open the called diagram');
    await expect(page.locator('svg .djs-element.selected[data-element-id="CallActivity_1"]')).toBeVisible();
});

// J9: the same mechanism for the DMN->BPMN direction — a Business Rule Task is
// auto-selected by its decisionRef (the id namespace tells the directions apart).
test('auto-selects the Business Rule Task for a decision id on open', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ selectCalledProcessIds: ['My_Decision'] }),
        fixtures: { xmlByRef: { 'mr-sha': BUSINESS_RULE_TASK_BPMN, 'base-sha': BUSINESS_RULE_TASK_BPMN } }
    });

    const badge = page.locator('.djs-overlay-note .dive-in-call-activity');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', 'Open the called decision');
    await expect(page.locator('svg .djs-element.selected[data-element-id="BusinessRuleTask_1"]')).toBeVisible();
});
