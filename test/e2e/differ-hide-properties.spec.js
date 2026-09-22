'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// The properties toggle sets display:none on the props cell AND the splitter, and
// flips its own glyph and accessible name (persisted to localStorage, but each
// Playwright test gets a fresh context so it always starts shown).
test('hides and shows the properties panel', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    // An icon button, so its accessible name has to come from aria-label (FEAT-0024).
    // The filled half tracks where the panel is: right when up, left when gone.
    await expect(page.getByRole('button', { name: 'Hide the properties panel' }))
        .toHaveText('◨');

    const props = page.locator('#bpmnProps_12345bf3d4e842caa0d88194431197c0');
    const splitter = page.locator('.differ-splitter');

    await expect(props).toBeVisible();
    await expect(splitter).toBeVisible();

    await page.getByRole('button', { name: 'Hide the properties panel' }).click();
    await expect(page.getByRole('button', { name: 'Show the properties panel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show the properties panel' })).toHaveText('◧');
    await expect(props).toBeHidden();
    await expect(splitter).toBeHidden();

    await page.getByRole('button', { name: 'Show the properties panel' }).click();
    await expect(page.getByRole('button', { name: 'Hide the properties panel' })).toBeVisible();
    await expect(props).toBeVisible();
    await expect(splitter).toBeVisible();
});
