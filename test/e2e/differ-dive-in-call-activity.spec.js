'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, CALL_ACTIVITY_BPMN
} = require('./support/boot-differ');
const {
    installTabCapture, getOpenDifferCalls, getOpenUrlCalls
} = require('./support/dive-in-capture');

const CALLED_HIT = {
    path: 'processes/sub-process.bpmn',
    line: 1,
    snippet: '<bpmn:process id="Sub_Process">'
};

async function selectCallActivity(page) {
    await page.locator('svg .djs-element[data-element-id="CallActivity_1"]').click();
    return page.locator('.djs-overlay-note .dive-in-call-activity');
}

// Clicking the dive-in badge resolves the called process file via searchCode and
// opens a nested differ. The fake returns CALLED_HIT, so the resolved file is
// sub-process.bpmn; the nested params carry the same platform/refs, the resolved
// file path/name, and the divedInFrom hint pointing back at this diagram. The
// nested file is .bpmn, so the BPMN message id is used (BPMN→BPMN routing).
test('resolves the called process and opens a nested differ with correct params', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': CALL_ACTIVITY_BPMN, 'base-sha': CALL_ACTIVITY_BPMN }, searchHits: [CALLED_HIT] }
    });
    await installTabCapture(page);
    const bpmnMsgId = await page.evaluate(() => BpmnDiffer.MSG_ID);

    const badge = await selectCallActivity(page);
    await badge.click();

    await expect.poll(async () => (await getOpenDifferCalls(page)).length).toBe(1);
    const [call] = await getOpenDifferCalls(page);
    expect(call.params.filePath).toBe('processes/sub-process.bpmn');
    expect(call.params.fileName).toBe('sub-process.bpmn');
    expect(call.params.sourceRef).toBe('mr-sha');
    expect(call.params.targetRef).toBe('base-sha');
    expect(call.params.platform.kind).toBe('fake');
    expect(call.params.divedInFrom).toEqual({ filePath: 'diagram.bpmn', fileName: 'diagram.bpmn' });
    expect(call.msgId).toBe(bpmnMsgId);
    // The resolve path opened the nested differ, not a plain URL tab.
    expect(await getOpenUrlCalls(page)).toEqual([]);
});

// When resolution finds no matching file (empty search results), the badge opens
// the human-facing repo search page for the process id instead of a nested differ.
test('falls back to the repo search page when the called file is not found', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': CALL_ACTIVITY_BPMN, 'base-sha': CALL_ACTIVITY_BPMN }, searchHits: [] }
    });
    await installTabCapture(page);

    const badge = await selectCallActivity(page);
    await badge.click();

    await expect.poll(async () => (await getOpenUrlCalls(page)).length).toBe(1);
    expect(await getOpenUrlCalls(page)).toEqual(['http://localhost/search?term=Sub_Process']);
    // No nested differ was opened.
    expect(await getOpenDifferCalls(page)).toEqual([]);
});

// UX-0008: while the resolve is in flight the badge shows a spinner (dive-in-loading
// class + "Loading…" title); when it finishes the arrow returns. We slow the fake's
// searchCode so the loading state is deterministically observable.
test('shows the loading spinner while resolving, then restores the arrow', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': CALL_ACTIVITY_BPMN, 'base-sha': CALL_ACTIVITY_BPMN }, searchHits: [CALLED_HIT] }
    });
    await installTabCapture(page);
    await page.evaluate((ms) => {
        const orig = FakePlatformClient.prototype.searchCode;
        FakePlatformClient.prototype.searchCode = async function (...args) {
            await new Promise((r) => setTimeout(r, ms));
            return orig.apply(this, args);
        };
    }, 250);

    const badge = await selectCallActivity(page);
    await badge.click();

    // During the slowed resolve: spinner on.
    await expect(badge).toHaveClass(/dive-in-loading/);
    await expect(badge).toHaveAttribute('title', 'Loading the called diagram…');

    // After it completes (openDiffer captured): spinner off, arrow restored.
    await expect.poll(async () => (await getOpenDifferCalls(page)).length).toBe(1);
    await expect(badge).not.toHaveClass(/dive-in-loading/);
    await expect(badge).toHaveAttribute('title', 'Open the called diagram');
});
