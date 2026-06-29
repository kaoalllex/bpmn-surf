'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// BUG-0026: the floating search panel used to sit at top:12px, in the toolbar's
// own vertical band; centered, it covered the right-pinned "Switch branch" button
// at common widths (incl. the default 1280px viewport) so a mouse click could not
// reach it while search was open. The panel now sits below the toolbar (floating
// over the canvas), keeping its non-modal find-bar behaviour (search stays usable
// across a branch switch — see the rebuild-on-switch coverage). This test runs at
// the default Desktop Chrome viewport (1280x720), exactly the width that regressed.
test('keeps "Switch branch" clickable while the search panel is open', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    await page.keyboard.press('Control+f');
    await expect(page.locator('.search-panel')).toBeVisible();

    // The panel must not vertically overlap the toolbar row.
    const toolbar = await page.locator('.differ-toolbar').boundingBox();
    const panel = await page.locator('.search-panel').boundingBox();
    expect(panel.y).toBeGreaterThanOrEqual(toolbar.y + toolbar.height);

    // A real click on "Switch branch" must land (not be intercepted by the panel):
    // switching flips the branch indicator from the MR side to the target side.
    await page.getByRole('button', { name: 'Switch branch' }).click();
    await expect(page.locator('span', { hasText: 'Original · master' })).toBeVisible();
});
