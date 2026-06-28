'use strict';

const { test, expect } = require('@playwright/test');
const { bootDmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// DMN analogue of the BPMN switch-branch test. show() renders the MR side first
// (Rule_3 added, indicator "Changed · feature"); "Switch branch" shows the base
// side where Rule_3 does not exist (indicator "Original · master"), and back.
test('switches between the MR and target versions (DMN)', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page);

    const addedRow = page.locator('.rule-index[data-row-id="Rule_3"]');
    const indicator = page.locator('.differ-toolbar span', { hasText: '·' });

    // MR side first: the added rule is present, source label shown.
    await expect(addedRow).toBeVisible();
    await expect(indicator).toContainText('Changed · feature');

    await page.getByRole('button', { name: 'Switch branch' }).click();

    // Base side: the added rule is gone, target label shown.
    await expect(addedRow).toHaveCount(0);
    await expect(indicator).toContainText('Original · master');

    // And back.
    await page.getByRole('button', { name: 'Switch branch' }).click();
    await expect(addedRow).toBeVisible();
    await expect(indicator).toContainText('Changed · feature');
});
