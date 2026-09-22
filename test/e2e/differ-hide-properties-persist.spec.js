'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

const PROPS_ID = '#bpmnProps_12345bf3d4e842caa0d88194431197c0';
const HIDDEN_KEY = 'bpmnDiffer.propsHidden';

// BUG-0018: an explicit Hide is persisted to localStorage and survives a reload
// (so it carries into a freshly opened dive-in/out tab). BUG-0023: showing the
// panel after it loaded hidden must render real content (no stale max-height:0
// collapse) — the panel becomes visible with a non-zero height.
test('persists Hide across reload and shows non-collapsed content afterwards', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    // Hide → persisted.
    await page.getByRole('button', { name: 'Hide the properties panel' }).click();
    const stored = await page.evaluate((k) => localStorage.getItem(k), HIDDEN_KEY);
    expect(stored).toBe('1');

    // Reload: the panel loads hidden, the toggle reads "Show the properties panel".
    await bootBpmnDiffer(page);
    await expect(page.getByRole('button', { name: 'Show the properties panel' })).toBeVisible();
    await expect(page.locator(PROPS_ID)).toBeHidden();

    // BUG-0023: Show → real, non-collapsed content.
    await page.getByRole('button', { name: 'Show the properties panel' }).click();
    const props = page.locator(PROPS_ID);
    await expect(props).toBeVisible();
    await expect(page.locator('.bio-properties-panel')).toBeVisible();
    const propsBox = await props.boundingBox();
    expect(propsBox.height).toBeGreaterThan(50);
});
