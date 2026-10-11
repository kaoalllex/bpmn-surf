'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootDmnDiffer, wireDiagnostics, defaultDmnParams, BASE_DMN, ADDED_RULE_DMN
} = require('./support/boot-differ');

const ADD_COLOUR = 'rgb(136, 255, 136)';

// The DMN twins of differ-highlight-branch-only and differ-modes (local file).

// "View decision" on a repository file: no source side, nothing to switch to.
test('branch-only mode renders the table with Switch disabled', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams({ sourceRef: undefined, sourceLabel: undefined }),
        fixtures: { xmlByRef: { 'base-sha': BASE_DMN } }
    });

    await expect(page.locator('.rule-index[data-row-id="Rule_1"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch branch' })).toBeDisabled();
    await expect(page.locator('a.differ-file-path')).toHaveAttribute('href', 'http://localhost/blob/base-sha/decision.dmn');
});

// "Diff with local file…": the picked file is the source side, with no ref.
test('local-file mode: Local role, inactive source path, the diff painted', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams({
            sourceRef: undefined,
            localFileContent: ADDED_RULE_DMN,
            sourceLabel: 'my-local.dmn'
        }),
        fixtures: { xmlByRef: { 'base-sha': BASE_DMN } }
    });

    await expect(page.locator('span', { hasText: 'Local · my-local.dmn' })).toBeVisible();
    const link = page.locator('a.differ-file-path');
    await expect(link).toHaveClass(/differ-file-path-inactive/);
    await expect(link).not.toHaveAttribute('href', /.+/);

    const addedRow = page.locator('.rule-index[data-row-id="Rule_3"]').locator('xpath=..');
    await expect(addedRow).toHaveCSS('background-color', ADD_COLOUR);

    await expect(page.getByRole('button', { name: 'Switch branch' })).toBeEnabled();
    await page.getByRole('button', { name: 'Switch branch' }).click();
    await expect(link).toHaveAttribute('href', 'http://localhost/blob/base-sha/decision.dmn');
});
