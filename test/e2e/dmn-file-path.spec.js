'use strict';

const { test, expect } = require('@playwright/test');
const { bootDmnDiffer, wireDiagnostics, defaultDmnParams, ADDED_RULE_DMN } = require('./support/boot-differ');

const LRM = '‎';

// The DMN twin of differ-file-path-active / -inactive: the header path is a link to
// the file at the shown version, rewritten on Switch, and inactive on a side where
// the file does not exist.
test('shows an active file-path link whose href tracks the shown side', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page);

    const link = page.locator('a.differ-file-path');
    await expect(link).toHaveAttribute('href', 'http://localhost/blob/mr-sha/decision.dmn');
    await expect(link).not.toHaveClass(/differ-file-path-inactive/);
    await expect(link).toHaveAttribute('title', 'decision.dmn');
    expect(await link.evaluate((el) => el.textContent)).toBe(LRM + 'decision.dmn');

    await page.getByRole('button', { name: 'Switch branch' }).click();
    await expect(link).toHaveAttribute('href', 'http://localhost/blob/base-sha/decision.dmn');
    await expect(link).not.toHaveClass(/differ-file-path-inactive/);
});

test('renders the file path inactive on the side where the file is absent', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': ADDED_RULE_DMN } }   // base-sha missing → a new file
    });

    const link = page.locator('a.differ-file-path');
    await expect(link).toHaveAttribute('href', 'http://localhost/blob/mr-sha/decision.dmn');

    await page.getByRole('button', { name: 'Switch branch' }).click();
    await expect(link).toHaveClass(/differ-file-path-inactive/);
    await expect(link).not.toHaveAttribute('href', /.+/);
});
