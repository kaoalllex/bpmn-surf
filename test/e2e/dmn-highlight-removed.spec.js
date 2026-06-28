'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootDmnDiffer, wireDiagnostics, defaultDmnParams, BASE_DMN, ADDED_RULE_DMN
} = require('./support/boot-differ');

// Mirror of the added case with the versions swapped: the base (target) side has
// the extra Rule_3, the MR removed it. show() renders the MR side first (2 rules,
// nothing to highlight); switching to the base side renders the 3-rule table and
// paints the removed rule with the REMOVE colour (#ff8888 → rgb(255,136,136)).
test('paints a removed decision rule red on the base side', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'base-sha': ADDED_RULE_DMN, 'mr-sha': BASE_DMN } }
    });

    // MR side first: only 2 rules, no Rule_3 yet.
    await expect(page.locator('.rule-index[data-row-id="Rule_3"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Switch branch' }).click();

    const removedRow = page.locator('.rule-index[data-row-id="Rule_3"]').locator('xpath=..');
    await expect(removedRow).toBeVisible();
    await expect(removedRow).toHaveCSS('background-color', 'rgb(255, 136, 136)');
});
