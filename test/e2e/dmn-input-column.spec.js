'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootDmnDiffer, wireDiagnostics, defaultDmnParams,
    BASE_DMN, ADDED_INPUT_COLUMN_DMN, CHANGED_INPUT_DMN
} = require('./support/boot-differ');

const GREEN = 'rgb(136, 255, 136)';   // DiffType.ADD
const RED = 'rgb(255, 136, 136)';     // DiffType.REMOVE
const BLUE = 'rgb(136, 136, 255)';    // DiffType.CHANGE

// An input column present in the MR but not the base is "added": the comparator
// reports it as missing-in-other while the MR side is shown, so the painter fills
// the column header green. The base side has no such column, so nothing about
// Input_2 renders there. NOTE: dmn-js gives BOTH the header <th> and each body
// rule <td> the same data-col-id (class "cell input-cell"), so the locator scopes
// to the header <th> — the first .input-cell[data-col-id] in DOM order, which is
// exactly what the painter's document.querySelector(...) paints.
test('paints an added input column green on the MR side', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': ADDED_INPUT_COLUMN_DMN, 'base-sha': BASE_DMN } }
    });

    const header = page.locator('th.input-cell[data-col-id="Input_2"]');
    await expect(header).toBeVisible();
    await expect(header).toHaveCSS('background-color', GREEN);
});

// The same column, now present only in the target version: after Switch the shown
// target side has Input_2 missing-in-other, so it is painted red (REMOVE).
test('paints a removed input column red after Switch', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': BASE_DMN, 'base-sha': ADDED_INPUT_COLUMN_DMN } }
    });

    await page.getByRole('button', { name: 'Switch branch' }).click();

    const header = page.locator('th.input-cell[data-col-id="Input_2"]');
    await expect(header).toBeVisible();
    await expect(header).toHaveCSS('background-color', RED);
});

// Same input id on both sides but a different <inputExpression> → CHANGED → blue,
// regardless of the shown side (changed columns always use DiffType.CHANGE).
test('paints a changed input column blue', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': CHANGED_INPUT_DMN, 'base-sha': BASE_DMN } }
    });

    const header = page.locator('th.input-cell[data-col-id="Input_1"]');
    await expect(header).toBeVisible();
    await expect(header).toHaveCSS('background-color', BLUE);
});
