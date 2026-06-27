'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// show() renders the MR side first (Task_2 present, indicator "Changed ·
// feature"). Clicking "Switch branch" shows the target/base side, where Task_2
// does not exist and the indicator reads "Original · master".
test('switches between the MR and target versions', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const addedTask = page.locator('svg .djs-element[data-element-id="Task_2"]');
    const indicator = page.locator('.differ-toolbar span', { hasText: '·' });

    // MR side first: added element present, source label shown.
    await expect(addedTask).toBeVisible();
    await expect(indicator).toContainText('Changed · feature');

    await page.getByRole('button', { name: 'Switch branch' }).click();

    // Target/base side: the added element is gone, target label shown.
    await expect(addedTask).toHaveCount(0);
    await expect(indicator).toContainText('Original · master');

    // And back.
    await page.getByRole('button', { name: 'Switch branch' }).click();
    await expect(addedTask).toBeVisible();
    await expect(indicator).toContainText('Changed · feature');
});
