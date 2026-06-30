'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, BUSINESS_RULE_TASK_BPMN
} = require('./support/boot-differ');
const {
    installTabCapture, getOpenDifferCalls, getOpenUrlCalls
} = require('./support/dive-in-capture');

const DECISION_HIT = {
    path: 'decisions/my-decision.dmn',
    line: 1,
    snippet: '<decision id="My_Decision">'
};

async function selectBusinessRuleTask(page) {
    await page.locator('svg .djs-element[data-element-id="BusinessRuleTask_1"]').click();
    return page.locator('.djs-overlay-note .dive-in-call-activity');
}

// FEAT-0005: diving into a Business Rule Task resolves the called DECISION file and
// opens the DMN differ. The resolved file is .dmn, so openDiffer is invoked with the
// DMN message id (BPMN→DMN routing) and the DMN file path/name.
test('resolves the called decision and opens the DMN differ (BPMN to DMN routing)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': BUSINESS_RULE_TASK_BPMN, 'base-sha': BUSINESS_RULE_TASK_BPMN }, searchHits: [DECISION_HIT] }
    });
    await installTabCapture(page);
    const dmnMsgId = await page.evaluate(() => DmnDiffer.MSG_ID);

    const badge = await selectBusinessRuleTask(page);
    await expect(badge).toHaveAttribute('title', 'Open the called decision');
    await badge.click();

    await expect.poll(async () => (await getOpenDifferCalls(page)).length).toBe(1);
    const [call] = await getOpenDifferCalls(page);
    expect(call.params.filePath).toBe('decisions/my-decision.dmn');
    expect(call.params.fileName).toBe('my-decision.dmn');
    expect(call.params.divedInFrom).toEqual({ filePath: 'diagram.bpmn', fileName: 'diagram.bpmn' });
    expect(call.msgId).toBe(dmnMsgId);
    expect(await getOpenUrlCalls(page)).toEqual([]);
});

// No DMN hit → fall back to the repo search page for the decision id.
test('falls back to the repo search page when the decision file is not found', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': BUSINESS_RULE_TASK_BPMN, 'base-sha': BUSINESS_RULE_TASK_BPMN }, searchHits: [] }
    });
    await installTabCapture(page);

    const badge = await selectBusinessRuleTask(page);
    await badge.click();

    await expect.poll(async () => (await getOpenUrlCalls(page)).length).toBe(1);
    expect(await getOpenUrlCalls(page)).toEqual(['http://localhost/search?term=My_Decision']);
    expect(await getOpenDifferCalls(page)).toEqual([]);
});
