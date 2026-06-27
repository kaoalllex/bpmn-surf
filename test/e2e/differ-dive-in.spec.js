'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, CALL_ACTIVITY_BPMN
} = require('./support/boot-differ');

// Selecting a Call Activity (with a calledElement) adds a bpmn-js overlay holding
// the dive-in badge. We assert the badge appears with its "open" affordance; the
// actual dive-in (click → resolve/open) needs tab/window.open handling and is out
// of scope here. Same XML on both sides keeps the scenario about the overlay, not
// the diff.
test('shows the dive-in overlay on a selected Call Activity', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'base-sha': CALL_ACTIVITY_BPMN, 'mr-sha': CALL_ACTIVITY_BPMN } }
    });

    await page.locator('svg .djs-element[data-element-id="CallActivity_1"]').click();

    const badge = page.locator('.djs-overlay-note .dive-in-call-activity');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', 'Open the called diagram');
});
