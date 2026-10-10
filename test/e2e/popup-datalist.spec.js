'use strict';

const { test, expect } = require('@playwright/test');

// The popup offers known values in its add fields through a native datalist:
// the stock topic annotations not yet listed, and the public sites. A stubbed
// chrome.* (nothing stored, no site granted — a fresh install) lets popup.js run
// from the static server.
function stubChromeApis() {
    const stored = {};
    window.chrome = {
        runtime: { getManifest: () => ({ version: '0.0.0' }) },
        permissions: {
            getAll: async () => ({ origins: [] }),
            request: async () => false,
            remove: async () => true
        },
        storage: {
            sync: {
                get: async (key) => ({ [key]: stored[key] }),
                set: async (obj) => Object.assign(stored, obj)
            },
            local: {
                get: async () => ({}),
                set: async () => {},
                remove: async () => {}
            }
        }
    };
}

const optionsOf = (page, inputSelector) => page.locator(inputSelector).evaluate((input) =>
    Array.from(input.list ? input.list.options : [], (option) => option.value));

test('suggests the stock annotations not yet listed and the public sites', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript(stubChromeApis);
    await page.goto('/src/popup/popup.html');

    await page.click('[data-open="annotations"]');
    await expect(page.locator('#topicAnnList li')).toHaveCount(2);
    await expect.poll(() => optionsOf(page, '#topicAnnInput')).toEqual(['ZeebeWorker']);

    await page.locator('#topicAnnList li', { hasText: '@JobWorker' }).locator('button').click();
    await expect.poll(() => optionsOf(page, '#topicAnnInput')).toEqual(['JobWorker', 'ZeebeWorker']);

    await expect(page.locator('#classAnnInput')).not.toHaveAttribute('list', /.*/);
    await expect(page.locator('[data-view="annotations"] h3').first()).toHaveText('Topic / job type in the annotation');
    await expect(page.locator('#annWarning')).not.toContainText('external tasks');

    await page.click('#backBtn');
    await page.click('[data-open="sites"]');
    await expect.poll(() => optionsOf(page, '#hostInput')).toEqual(['gitlab.com', 'github.com']);

    expect(pageErrors).toEqual([]);
});
