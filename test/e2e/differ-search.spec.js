'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// Ctrl/Cmd+F opens the search panel (the handler keys on event.code 'KeyF' and
// preventDefaults Chrome's native find). Typing "Notify" matches Task_2; the
// matched element gets the search-match class and the counter shows the count.
test('finds an element via Ctrl/Cmd+F search', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    // Open the panel (Control works cross-platform — the handler accepts ctrlKey).
    await page.keyboard.press('Control+f');

    const panel = page.locator('.search-panel');
    await expect(panel).toBeVisible();
    const input = page.locator('input.search-panel-input');
    await expect(input).toBeFocused();

    await input.fill('Notify');

    // The matching element is marked on the canvas, and the counter is non-empty.
    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]'))
        .toHaveClass(/search-match/);
    await expect(page.locator('.search-panel-counter')).not.toBeEmpty();
});
