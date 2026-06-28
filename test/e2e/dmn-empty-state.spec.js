'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootDmnDiffer, wireDiagnostics, defaultDmnParams
} = require('./support/boot-differ');

// Both refs point at content the fake does not have (empty fixtures map) →
// loadFileContent returns '' for each side → the DMN differ shows the centered
// "absent in both" placeholder and never imports a table (BUG-0001 / UX-0003).
// The expected "[console.error] dmn file is unavailable in both versions" line is
// the differ's own diagnostic — not a test failure.
test('shows a placeholder when the DMN file is absent in both versions', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams({ sourceRef: 'gone', targetRef: 'gone' }),
        fixtures: { xmlByRef: {} }
    });

    await expect(page.locator('.differ-empty-state')).toBeVisible();
    await expect(page.locator('.differ-empty-state-message'))
        .toHaveText('File does not exist in either version');
    // No decision table was rendered.
    await expect(page.locator('.rule-index')).toHaveCount(0);
    // Nothing to download.
    await expect(page.getByTitle('Download the file as shown for the current branch'))
        .toBeDisabled();
});
