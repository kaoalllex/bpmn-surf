'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// "Hide properties" sets display:none on the props cell AND the splitter, and
// flips its own label to "Show properties" (persisted to localStorage, but each
// Playwright test gets a fresh context so it always starts shown).
test('hides and shows the properties panel', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const props = page.locator('#bpmnProps_12345bf3d4e842caa0d88194431197c0');
    const splitter = page.locator('.differ-splitter');

    await expect(props).toBeVisible();
    await expect(splitter).toBeVisible();

    await page.getByRole('button', { name: 'Hide properties' }).click();
    await expect(page.getByRole('button', { name: 'Show properties' })).toBeVisible();
    await expect(props).toBeHidden();
    await expect(splitter).toBeHidden();

    await page.getByRole('button', { name: 'Show properties' }).click();
    await expect(page.getByRole('button', { name: 'Hide properties' })).toBeVisible();
    await expect(props).toBeVisible();
    await expect(splitter).toBeVisible();
});
