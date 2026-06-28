'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootDmnDiffer, wireDiagnostics, defaultDmnParams, ADDED_RULE_DMN
} = require('./support/boot-differ');

// New file in the MR: the base side has no file (base-sha is absent from the
// fixtures map → the fake serves empty content → "absent"). show() renders the MR
// side; switching to the absent base side shows a blank cover (empty message),
// marks the label italic-grey with "file does not exist", and disables Download
// (UX-0003 / BUG-0001). The absence is signalled in the label, not by a banner.
test('shows the absent-side placeholder when switching to a new file base side', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': ADDED_RULE_DMN } }   // base-sha missing → absent
    });

    await page.getByRole('button', { name: 'Switch branch' }).click();

    // Blank cover: present and shown (flex), but with no message text.
    const cover = page.locator('.differ-empty-state');
    await expect(cover).toHaveCSS('display', 'flex');
    await expect(page.locator('.differ-empty-state-message')).toHaveText('');

    // Absence is spelled out in the label: italic, grey, side-specific note.
    const indicator = page.locator('.differ-toolbar span', { hasText: '·' });
    await expect(indicator).toContainText('Original · master · file does not exist');
    await expect(indicator).toHaveCSS('color', 'rgb(128, 128, 128)');
    await expect(indicator).toHaveCSS('font-style', 'italic');

    // Nothing to download on the absent side.
    await expect(page.getByTitle('Download the file as shown for the current branch'))
        .toBeDisabled();
});
