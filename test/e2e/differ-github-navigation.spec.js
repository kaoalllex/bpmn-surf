'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, CALL_ACTIVITY_BPMN } = require('./support/boot-differ');
const { installTabCapture, getOpenDifferCalls, getOpenUrlCalls } = require('./support/dive-in-capture');

// The repository-tree walk (ProcessFileIndex) is GitLab's API; on any other
// platform a dive-in miss must go straight to the search-page fallback.
test('a non-GitLab dive-in miss never walks the GitLab repository tree', async ({ page }) => {
    wireDiagnostics(page);
    const gitlabApiRequests = [];
    page.on('request', (request) => {
        if (request.url().includes('/api/v4/')) {
            gitlabApiRequests.push(request.url());
        }
    });
    const params = defaultBpmnParams();
    params.platform = { ...params.platform, kind: 'github' };
    await bootBpmnDiffer(page, {
        params,
        fixtures: { xmlByRef: { 'mr-sha': CALL_ACTIVITY_BPMN, 'base-sha': CALL_ACTIVITY_BPMN }, searchHits: [] }
    });
    await installTabCapture(page);

    await page.locator('svg .djs-element[data-element-id="CallActivity_1"]').click();
    await page.locator('.djs-overlay-note .dive-in-call-activity').click();

    await expect.poll(async () => (await getOpenUrlCalls(page)).length).toBe(1);
    expect(await getOpenDifferCalls(page)).toEqual([]);
    expect(gitlabApiRequests).toEqual([]);
});
