'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, HANDLER_BADGES_BPMN
} = require('./support/boot-differ');
const { installCapture, getOpenCalls } = require('./support/dive-out-capture');

// Section H: PRESENT-branch of DifferTabNavigator.navigateOpenerTab. With a fake
// same-origin window.opener installed (the Phase 4e seam), clicking a CHANGED
// handler badge navigates the already-open opener tab to the handler's MR-diff URL
// — window.open(mrDiffUrl, OPENER_TAB_TARGET) returns true, so the differ does NOT
// fall back to a new tab. The absent-opener branch (fallback to window.open(url,
// '_blank')) is the counterpart covered by differ-handler-badge-click.spec.js
// ("changed handler click opens the MR diff (opener-tab fallback)").
//
// The dive-out capture seam records window.open as [url, name], so the present
// target OPENER_TAB_TARGET is distinguishable from the fallback '_blank' — unlike
// handler-open-capture.js, which records a single-arg [url].
test('changed handler click navigates the opener tab to the MR diff (opener present)', async ({ page }) => {
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
    await installCapture(page, { opener: true });
    const openerTarget = await page.evaluate(() => DifferTabNavigator.OPENER_TAB_TARGET);

    const badge = page.locator('.handler-link-added');
    await expect(badge).toBeVisible();
    await badge.click();

    // Exactly one window.open — the opener navigation; the bare-url fallback did NOT fire.
    await expect.poll(async () => (await getOpenCalls(page)).length).toBe(1);
    const [[url, name]] = await getOpenCalls(page);
    expect(url).toMatch(/^http:\/\/localhost\/mr\/42\/diffs#[0-9a-f]{40}$/); // sha1-anchored MR diff
    expect(name).toBe(openerTarget);                                        // present branch, not '_blank'
});
