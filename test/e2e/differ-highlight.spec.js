'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// The MR (default side) adds Task_2 + Flow_3 over base. The diff highlight
// outline is OFF by default; clicking the ☼ button turns it on (a 1.5 s pulse
// phase, then steady). We assert the marker class appears — robust against the
// pulse→steady swap and free of brittle computed-color checks.
test('toggles the diff highlight on the added elements', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const addedTask = page.locator('svg .djs-element[data-element-id="Task_2"]');
    await expect(addedTask).toBeVisible();

    // Off by default: no highlight marker yet.
    await expect(addedTask).not.toHaveClass(/highlight-diff/);

    // Turn the diff highlight on (icon button — located by its title).
    await page.getByTitle('Turn diff highlight on').click();

    // The button flipped to the "off" affordance.
    await expect(page.getByTitle('Turn diff highlight off')).toBeVisible();

    // The added elements now carry a highlight marker (pulse or steady).
    await expect(addedTask).toHaveClass(/highlight-diff/);
    await expect(page.locator('svg .djs-element[data-element-id="Flow_3"]'))
        .toHaveClass(/highlight-diff/);

    // After the pulse settles it becomes the steady marker.
    await expect(addedTask).toHaveClass(/(^|\s)highlight-diff(\s|$)/, { timeout: 3000 });
});
