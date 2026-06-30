'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, HANDLER_BADGES_BPMN
} = require('./support/boot-differ');
const {
    installHandlerOpenCapture, getOpenCalls, getNavigated
} = require('./support/handler-open-capture');

// Clicking an UNCHANGED handler badge opens a blank tab synchronously, then
// navigates it to the handler file's blob URL at the shown ref (mr-sha) once
// resolveLocation (via searchCode) returns the hit.
test('unchanged handler click opens blank tab then navigates to the blob URL', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),   // no changeRequestId → ClassTask is "unchanged"
        fixtures: {
            xmlByRef: { 'mr-sha': HANDLER_BADGES_BPMN, 'base-sha': HANDLER_BADGES_BPMN },
            searchHits: [{ path: 'src/PrepareDelegate.kt', line: 5, snippet: 'class PrepareDelegate' }]
        }
    });
    await installHandlerOpenCapture(page);

    await page.locator('svg .djs-element[data-element-id="ClassTask"]').click();
    await page.locator('.djs-overlay-note .handler-link').click();

    await expect.poll(async () => await getNavigated(page)).toEqual(
        ['http://localhost/blob/mr-sha/src/PrepareDelegate.kt#L5']
    );
    expect(await getOpenCalls(page)).toEqual(['about:blank']);
});

// When the handler source cannot be located (no search hits), the blank tab is
// navigated to the repo search page for the handler term instead.
test('unchanged handler click falls back to the repo search page', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: {
            xmlByRef: { 'mr-sha': HANDLER_BADGES_BPMN, 'base-sha': HANDLER_BADGES_BPMN },
            searchHits: []
        }
    });
    await installHandlerOpenCapture(page);

    await page.locator('svg .djs-element[data-element-id="ClassTask"]').click();
    await page.locator('.djs-overlay-note .handler-link').click();

    await expect.poll(async () => await getNavigated(page)).toEqual(
        ['http://localhost/search?term=PrepareDelegate']
    );
});

// Clicking a CHANGED handler badge opens its MR diff. In Layer-2 there is no
// window.opener, so navigateOpenerTab returns false and the differ falls back to
// window.open(mrDiffUrl) — the MR diffs page anchored by the file-path SHA-1.
test('changed handler click opens the MR diff (opener-tab fallback)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ changeRequestId: 42 }),
        fixtures: {
            xmlByRef: { 'mr-sha': HANDLER_BADGES_BPMN, 'base-sha': HANDLER_BADGES_BPMN },
            changedFiles: [{ path: 'src/ScoreCarTask.kt', status: 'added' }],
            contentByRefPath: {
                'mr-sha:src/ScoreCarTask.kt': '@ExternalTaskSubscription("scoreCar")\nclass ScoreCarTask'
            }
        }
    });
    await installHandlerOpenCapture(page);

    const badge = page.locator('.handler-link-added');
    await expect(badge).toBeVisible();
    await badge.click();

    await expect.poll(async () => (await getOpenCalls(page)).length).toBe(1);
    const [url] = await getOpenCalls(page);
    expect(url).toMatch(/^http:\/\/localhost\/mr\/42\/diffs#[0-9a-f]{40}$/);
});
