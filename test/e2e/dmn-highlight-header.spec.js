'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootDmnDiffer, wireDiagnostics, defaultDmnParams, BASE_DMN, CHANGED_HEADER_DMN
} = require('./support/boot-differ');

// changed-header.dmn (an existing golden) changes the decision name (Discount →
// Rebate) and the hit policy (FIRST → COLLECT) vs base.dmn; the rules are identical
// to base, so no row is highlighted — this isolates the header path. DmnXmlComparator
// flags div.decision-table-name, which DmnDiffPainter fills with the CHANGE colour
// (#8888ff → rgb(136,136,255)).
test('paints a changed decision name in the table header blue', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'base-sha': BASE_DMN, 'mr-sha': CHANGED_HEADER_DMN } }
    });

    await expect(page.locator('div.decision-table-name'))
        .toHaveCSS('background-color', 'rgb(136, 136, 255)');
});
