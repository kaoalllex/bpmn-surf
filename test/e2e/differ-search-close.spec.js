'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// close() hides the .search-panel (display:none) and clears every match marker
// (search-match and search-match-current). Triggered by Escape...
test('Esc closes the panel and removes the match markers', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    await page.keyboard.press('Control+f');
    const panel = page.locator('.search-panel');
    await expect(panel).toBeVisible();

    const input = page.locator('input.search-panel-input');
    await input.fill('Notify');
    await input.press('Enter');
    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]'))
        .toHaveClass(/search-match-current/);

    await page.keyboard.press('Escape');

    await expect(panel).toBeHidden();
    await expect(page.locator('svg .search-match')).toHaveCount(0);
    await expect(page.locator('svg .search-match-current')).toHaveCount(0);
});

// ...and by the ✕ button.
test('the ✕ button closes the panel and removes the match markers', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    await page.keyboard.press('Control+f');
    const panel = page.locator('.search-panel');
    await expect(panel).toBeVisible();

    const input = page.locator('input.search-panel-input');
    await input.fill('Notify');
    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]'))
        .toHaveClass(/search-match/);

    await page.getByTitle('Close (Esc)').click();

    await expect(panel).toBeHidden();
    await expect(page.locator('svg .search-match')).toHaveCount(0);
});
