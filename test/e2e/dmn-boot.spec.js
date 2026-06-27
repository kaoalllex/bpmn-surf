'use strict';

const { test, expect } = require('@playwright/test');
const { bootDmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// DMN analogue of the BPMN boot smoke: the real DmnDiffer renders the decision
// table from the semantic fixture (no DI needed) with the FakePlatformClient.
test('boots the DMN differ and renders the decision table', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page);

    await expect(page.locator('.differ-toolbar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch branch' })).toBeVisible();

    const canvas = page.locator('#dmnCanvas_12345bf3d4e842caa0d88194431197c0');
    await expect(canvas).toBeVisible();
    // dmn-js renders the decision table into the canvas cell.
    await expect(canvas.locator('table')).toBeVisible();
    await expect(canvas).toContainText('Discount');
});
