'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, defaultBpmnParams } = require('./support/boot-differ');

// FEAT-0012: when params carry updateInfo (updateAvailable + latestVersion), the
// toolbar shows a "🔔 v<version>" button. Clicking it opens the popup URL in a new
// tab (window.open). The differ reads updateInfo straight off rawParams.
test('shows the update indicator and opens the popup on click', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({
            // Port 4173 = harness origin (playwright.config.js baseURL); without it
            // Chromium lands on chrome-error:// and popup.url() is non-deterministic.
            updateInfo: { updateAvailable: true, latestVersion: '1.2.3', popupUrl: 'http://localhost:4173/popup.html' }
        })
    });

    const indicator = page.locator('.differ-update-indicator');
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveText('🔔 v1.2.3');
    await expect(indicator).toHaveAttribute('title', 'Update available for bpmn-surf — open the update window');

    const [popup] = await Promise.all([
        page.waitForEvent('popup'),
        indicator.click()
    ]);
    expect(popup.url()).toContain('popup.html');
});

// No updateInfo → UpdateIndicator.createElement returns null → nothing is added.
test('shows no update indicator when there is no update info', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);   // default params carry no updateInfo

    await expect(page.locator('.differ-update-indicator')).toHaveCount(0);
});
