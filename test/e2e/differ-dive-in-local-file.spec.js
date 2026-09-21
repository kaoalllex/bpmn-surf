'use strict';

// BUG-0033: comparing against a local file leaves sourceRef null, and the local
// side is the one shown first. The ref of the shown version feeds every
// repository lookup (Call Activity dive-in, decision dive-in, handler code,
// correlation search), so a null there built `ref=null` URLs — the blob search
// was skipped by its own guard and the fallback index 404'd.
const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, CALL_ACTIVITY_BPMN, BASE_BPMN
} = require('./support/boot-differ');
const { installTabCapture, getOpenDifferCalls } = require('./support/dive-in-capture');

const CALLED_HIT = {
    path: 'processes/sub-process.bpmn',
    line: 1,
    snippet: '<bpmn:process id="Sub_Process">'
};

const localFileParams = () => defaultBpmnParams({
    sourceRef: null,
    sourceLabel: 'my-draft.bpmn',
    localFileContent: CALL_ACTIVITY_BPMN
});

const searchCalls = (page) => page.evaluate(() => window.__platformClient.searchCalls);

test('dives in from a local-file comparison using the compared ref, never a null one', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: localFileParams(),
        fixtures: { xmlByRef: { 'base-sha': BASE_BPMN }, searchHits: [CALLED_HIT] }
    });
    await installTabCapture(page);

    await page.locator('svg .djs-element[data-element-id="CallActivity_1"]').click();
    await page.locator('.djs-overlay-note .dive-in-call-activity').click();

    // The blob search runs at all — its own `if (!ref) return null` guard used to
    // swallow it — and it runs against the repository version being compared.
    await expect.poll(async () => (await searchCalls(page)).length).toBe(1);
    const [search] = await searchCalls(page);
    expect(search.ref).toBe('base-sha');
    expect(search.ref).not.toBeNull();

    await expect.poll(async () => (await getOpenDifferCalls(page)).length).toBe(1);
    const [call] = await getOpenDifferCalls(page);
    expect(call.params.filePath).toBe('processes/sub-process.bpmn');
});

test('an ordinary MR diff still dives in at the shown MR ref', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': CALL_ACTIVITY_BPMN, 'base-sha': CALL_ACTIVITY_BPMN }, searchHits: [CALLED_HIT] }
    });
    await installTabCapture(page);

    await page.locator('svg .djs-element[data-element-id="CallActivity_1"]').click();
    await page.locator('.djs-overlay-note .dive-in-call-activity').click();

    await expect.poll(async () => (await searchCalls(page)).length).toBe(1);
    expect((await searchCalls(page))[0].ref).toBe('mr-sha');
});
