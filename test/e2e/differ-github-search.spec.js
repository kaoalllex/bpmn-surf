'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, CALL_ACTIVITY_BPMN, BUSINESS_RULE_TASK_BPMN } = require('./support/boot-differ');
const { installTabCapture, getOpenDifferCalls, getOpenUrlCalls } = require('./support/dive-in-capture');
const { ORIGIN, githubParams, routeGitHub } = require('./support/github-routes');

// Dive-in through the real GitHub client (support/github-routes.js).
const SUB = '<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D"><bpmn:process id="Sub_Process" /></bpmn:definitions>';

async function diveIn(page, id = 'CallActivity_1') {
    await page.locator(`svg .djs-element[data-element-id="${id}"]`).click();
    await page.locator('.djs-overlay-note .dive-in-call-activity').click();
}

test('dives into a process the default-branch search finds', async ({ page }) => {
    wireDiagnostics(page);
    await routeGitHub(page, {
        raw: { 'diagram.bpmn': CALL_ACTIVITY_BPMN },
        searchHits: [{ path: 'flows/sub.bpmn', line: 1, snippet: '<bpmn:process id="Sub_Process" />' }]
    });
    await bootBpmnDiffer(page, { params: githubParams(), realClient: true });
    await installTabCapture(page);
    await diveIn(page);
    await expect.poll(async () => (await getOpenDifferCalls(page)).length).toBe(1);
    expect((await getOpenDifferCalls(page))[0].params.filePath).toBe('flows/sub.bpmn');
});

test('dives into a process the PR itself adds although the search is rate limited', async ({ page }) => {
    wireDiagnostics(page);
    await routeGitHub(page, {
        raw: { 'diagram.bpmn': CALL_ACTIVITY_BPMN, 'flows/new-sub.bpmn': SUB },
        searchHits: null,
        prFiles: { 'flows/new-sub.bpmn': 'ADDED' }
    });
    await bootBpmnDiffer(page, { params: githubParams(), realClient: true });
    await installTabCapture(page);
    await diveIn(page);
    await expect.poll(async () => (await getOpenDifferCalls(page)).length).toBe(1);
    expect((await getOpenDifferCalls(page))[0].params.filePath).toBe('flows/new-sub.bpmn');
});

test('falls back to the host\'s search page when nothing is found', async ({ page }) => {
    wireDiagnostics(page);
    await routeGitHub(page, { raw: { 'diagram.bpmn': CALL_ACTIVITY_BPMN }, searchHits: [] });
    await bootBpmnDiffer(page, { params: githubParams(), realClient: true });
    await installTabCapture(page);
    await diveIn(page);
    await expect.poll(async () => (await getOpenUrlCalls(page)).length).toBe(1);
    expect((await getOpenUrlCalls(page))[0].startsWith(`${ORIGIN}/search?`)).toBe(true);
});

// The twin of differ-dive-in-decision.spec.js: a business rule task opens the DMN differ.
test('dives into the called decision the search finds, in the DMN differ', async ({ page }) => {
    wireDiagnostics(page);
    await routeGitHub(page, {
        raw: { 'diagram.bpmn': BUSINESS_RULE_TASK_BPMN },
        searchHits: [{ path: 'decisions/my-decision.dmn', line: 1, snippet: '<decision id="My_Decision">' }]
    });
    await bootBpmnDiffer(page, { params: githubParams(), realClient: true });
    await installTabCapture(page);
    await diveIn(page, 'BusinessRuleTask_1');
    await expect.poll(async () => (await getOpenDifferCalls(page)).length).toBe(1);
    const [call] = await getOpenDifferCalls(page);
    expect(call.params.filePath).toBe('decisions/my-decision.dmn');
    expect(call.msgId).toBe(await page.evaluate(() => DmnDiffer.MSG_ID));
});

test('a decision the search does not find opens the host\'s search page for its id', async ({ page }) => {
    wireDiagnostics(page);
    await routeGitHub(page, { raw: { 'diagram.bpmn': BUSINESS_RULE_TASK_BPMN }, searchHits: [] });
    await bootBpmnDiffer(page, { params: githubParams(), realClient: true });
    await installTabCapture(page);
    await diveIn(page, 'BusinessRuleTask_1');
    await expect.poll(async () => (await getOpenUrlCalls(page)).length).toBe(1);
    const url = new URL((await getOpenUrlCalls(page))[0]);
    expect(url.origin + url.pathname).toBe(`${ORIGIN}/search`);
    expect(url.searchParams.get('q')).toBe('repo:acme/flows My_Decision');
    expect(await getOpenDifferCalls(page)).toEqual([]);
});
