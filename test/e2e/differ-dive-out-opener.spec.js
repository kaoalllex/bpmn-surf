'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, CALL_ACTIVITY_BPMN
} = require('./support/boot-differ');
const {
    installCapture, getOpenDifferCalls, getOpenCalls, getCloseCount
} = require('./support/dive-out-capture');

const CA_FIXTURES = { xmlByRef: { 'mr-sha': CALL_ACTIVITY_BPMN, 'base-sha': CALL_ACTIVITY_BPMN } };
const diveOutButton = (page) => page.locator('.differ-back-group button:not(.differ-back-caret)');
const caret = (page) => page.locator('.differ-back-caret');

// J1: arrived here by diving in (divedInFrom set) and the opener tab is still open,
// so the dive-out arrow jumps straight to it: focus the opener by its transient
// name (empty-URL open, no reload) and close this tab. No new differ is opened.
test('dive-out arrow focuses the opener tab and closes this one (divedInFrom + opener)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ divedInFrom: { filePath: 'parent.bpmn', fileName: 'parent.bpmn' } }),
        fixtures: CA_FIXTURES
    });
    await installCapture(page, { opener: true });
    const openerTarget = await page.evaluate(() => DifferTabNavigator.OPENER_TAB_TARGET);

    const button = diveOutButton(page);
    await expect(button).toHaveText('⤴');
    await expect(button).toHaveAttribute('title', 'Dive out to a calling diagram (parent.bpmn)');
    await button.click();

    await expect.poll(() => getCloseCount(page)).toBe(1);
    expect(await getOpenCalls(page)).toContainEqual(['', openerTarget]);
    expect(await getOpenDifferCalls(page)).toEqual([]); // no duplicate/new differ tab
});

// J2: arrived by diving in, but the opener tab is gone (no window.opener in this
// page). The arrow falls back to REOPENING the caller as a fresh differ, asking it
// to auto-select the call site to the diagram we came from (selectCalledProcessIds =
// this diagram's process ids). It carries no divedInFrom (that is the dive-IN hint).
test('dive-out arrow reopens the caller when the opener tab is gone', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ divedInFrom: { filePath: 'parent.bpmn', fileName: 'parent.bpmn' } }),
        fixtures: CA_FIXTURES
    });
    await installCapture(page); // no fake opener -> window.opener is null

    await diveOutButton(page).click();

    await expect.poll(async () => (await getOpenDifferCalls(page)).length).toBe(1);
    const [call] = await getOpenDifferCalls(page);
    expect(call.params.filePath).toBe('parent.bpmn');
    expect(call.params.fileName).toBe('parent.bpmn');
    expect(call.params.selectCalledProcessIds).toEqual(['Process_2']);
    expect(call.params.divedInFrom).toBeUndefined();
    expect(call.msgId).toBe(await page.evaluate(() => BpmnDiffer.MSG_ID));
    expect(await getCloseCount(page)).toBe(0);
});

// J7: opening the caller MENU and clicking the "came from here" row reuses the open
// opener tab (same fast path as the arrow) rather than opening it afresh.
test('clicking the came-from caller row reuses the opener tab', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ divedInFrom: { filePath: 'parent.bpmn', fileName: 'parent.bpmn' } }),
        fixtures: { ...CA_FIXTURES, searchHits: [{ path: 'parent.bpmn', line: 1, snippet: 'calledElement="Process_2"' }] }
    });
    await installCapture(page, { opener: true });
    const openerTarget = await page.evaluate(() => DifferTabNavigator.OPENER_TAB_TARGET);

    await caret(page).click();
    const cameFromRow = page.locator('.differ-back-menu-item-came-from');
    await expect(cameFromRow).toBeVisible();
    await expect(cameFromRow.locator('.differ-back-menu-name')).toHaveText('parent.bpmn');
    await expect(cameFromRow.locator('.differ-back-menu-mark')).toHaveText('↩ came from here');
    await cameFromRow.click();

    await expect.poll(() => getCloseCount(page)).toBe(1);
    expect(await getOpenCalls(page)).toContainEqual(['', openerTarget]);
    expect(await getOpenDifferCalls(page)).toEqual([]);
});
