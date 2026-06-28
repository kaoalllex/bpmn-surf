'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootDmnDiffer, wireDiagnostics, defaultDmnParams, BASE_DMN, CHANGED_CELL_DMN
} = require('./support/boot-differ');

// dmn-cell-changed.dmn keeps both base rules but changes Rule_2's output entry
// (LiteralExpression_2: 0.1 → 0.15). On the MR side the kept-but-changed CELL is
// painted with the CHANGE colour (#8888ff → rgb(136,136,255)); the row itself is
// NOT repainted — only the changed cell, identified by its outputEntry id.
test('paints a changed rule cell blue on the MR side', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'base-sha': BASE_DMN, 'mr-sha': CHANGED_CELL_DMN } }
    });

    await expect(page.locator('[data-element-id="LiteralExpression_2"]'))
        .toHaveCSS('background-color', 'rgb(136, 136, 255)');
});
