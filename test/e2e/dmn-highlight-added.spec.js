'use strict';

const { test, expect } = require('@playwright/test');
const { bootDmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// Default DMN scenario: the MR (mr-sha) adds Rule_3 over base. show() renders the
// MR side first and auto-paints the diff (no on/off toggle, unlike BPMN). The added
// rule's row gets the ADD colour (#88ff88 → rgb(136,255,136)), set inline by
// DmnDiffPainter on the parent of the .rule-index cell — assertable without styles.css.
test('paints an added decision rule green on the MR side', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page);

    const addedRow = page.locator('.rule-index[data-row-id="Rule_3"]').locator('xpath=..');
    await expect(addedRow).toBeVisible();
    await expect(addedRow).toHaveCSS('background-color', 'rgb(136, 255, 136)');
});
