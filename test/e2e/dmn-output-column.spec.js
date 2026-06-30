'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootDmnDiffer, wireDiagnostics, defaultDmnParams,
    BASE_DMN, ADDED_OUTPUT_COLUMN_DMN, CHANGED_OUTPUT_LABEL_DMN
} = require('./support/boot-differ');

const GREEN = 'rgb(136, 255, 136)';
const RED = 'rgb(255, 136, 136)';
const BLUE = 'rgb(136, 136, 255)';

// The painter finds the output header by matching .output-label textContent, then
// fills its PARENT cell. So locate the label by text and assert on its parent.
function outputHeader(page, label) {
    return page.locator('.output-label', { hasText: label }).locator('xpath=..');
}

// An output column present in the MR but not the base is "added" → green on the MR
// side. The label "Status" only exists in the MR fixture.
test('paints an added output column green on the MR side', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': ADDED_OUTPUT_COLUMN_DMN, 'base-sha': BASE_DMN } }
    });

    const header = outputHeader(page, 'Status');
    await expect(header).toBeVisible();
    await expect(header).toHaveCSS('background-color', GREEN);
});

// Same column present only in the target → red after Switch (REMOVE).
test('paints a removed output column red after Switch', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': BASE_DMN, 'base-sha': ADDED_OUTPUT_COLUMN_DMN } }
    });

    await page.getByRole('button', { name: 'Switch branch' }).click();

    const header = outputHeader(page, 'Status');
    await expect(header).toBeVisible();
    await expect(header).toHaveCSS('background-color', RED);
});

// Same output id, changed label ("Discount" → "Rebate") → CHANGED → blue. The MR
// side shows the new label "Rebate"; the comparator reports it as changedOutputLabel.
test('paints a changed output column blue', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': CHANGED_OUTPUT_LABEL_DMN, 'base-sha': BASE_DMN } }
    });

    const header = outputHeader(page, 'Rebate');
    await expect(header).toBeVisible();
    await expect(header).toHaveCSS('background-color', BLUE);
});
