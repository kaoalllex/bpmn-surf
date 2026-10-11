'use strict';

const { test, expect } = require('@playwright/test');
const { installChromeStub, stubState } = require('./support/popup-chrome-stub');

// The Sites screen of the popup over a stateful chrome.* (the permission dialog
// itself is Chrome's and stays a manual check, see the live-check catalog).

const SITE = 'https://gitlab.example.com/*';

async function openSites(page) {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto('/src/popup/popup.html');
    await page.click('[data-open="sites"]');
    return pageErrors;
}

const siteRow = (page, host) => page.locator('#siteList li', { hasText: host });

test('adds a site through the permission request and removes it again', async ({ page }) => {
    await installChromeStub(page);
    const pageErrors = await openSites(page);
    await expect(page.locator('#noSitesWarning')).toBeVisible();

    await page.fill('#hostInput', 'gitlab.example.com');
    await page.locator('#addHostForm button[type="submit"]').click();

    await expect(siteRow(page, 'gitlab.example.com')).toHaveCount(1);
    await expect(page.locator('#hostInput')).toHaveValue('');
    await expect(page.locator('#noSitesWarning')).toBeHidden();
    expect((await stubState(page)).requests).toEqual([[SITE]]);

    await siteRow(page, 'gitlab.example.com').getByTitle('Remove gitlab.example.com').click();

    await expect(siteRow(page, 'gitlab.example.com')).toHaveCount(0);
    await expect(page.locator('#noSitesWarning')).toBeVisible();
    expect((await stubState(page)).removals).toEqual([[SITE]]);
    await page.click('#backBtn');
    await expect(page.locator('#noSitesHomeWarning')).toBeVisible();
    expect(pageErrors).toEqual([]);
});

test('keeps a refused site out of the list and the host in the field', async ({ page }) => {
    await installChromeStub(page, { granted: false });
    await openSites(page);

    await page.fill('#hostInput', 'gitlab.example.com');
    await page.locator('#addHostForm button[type="submit"]').click();

    await expect.poll(async () => (await stubState(page)).requests).toEqual([[SITE]]);
    await expect(siteRow(page, 'gitlab.example.com')).toHaveCount(0);
    await expect(page.locator('#hostInput')).toHaveValue('gitlab.example.com');
});

test('stores the type picked for a site and shows it after a reload', async ({ page }) => {
    await installChromeStub(page, {
        seed: { origins: [SITE], local: { undetectedSites: { hosts: ['gitlab.example.com'] } } }
    });
    const pageErrors = await openSites(page);
    const row = siteRow(page, 'gitlab.example.com');
    await expect(row.locator('.pu-site-note')).toBeVisible();
    await page.click('#backBtn');
    await expect(page.locator('#undetectedHomeWarning')).toBeVisible();
    await page.click('[data-open="sites"]');

    await row.locator('select.pu-site-kind').selectOption('github');

    await expect(row.locator('.pu-site-note')).toHaveCount(0);
    await expect.poll(async () => (await stubState(page)).sync.settings.siteKinds)
        .toEqual({ 'gitlab.example.com': 'github' });

    await page.reload();
    await page.click('[data-open="sites"]');
    await expect(siteRow(page, 'gitlab.example.com').locator('select.pu-site-kind')).toHaveValue('github');
    await page.click('#backBtn');
    await expect(page.locator('#undetectedHomeWarning')).toBeHidden();
    expect(pageErrors).toEqual([]);
});

test('offers no type select for the public sites', async ({ page }) => {
    await installChromeStub(page, { seed: { origins: ['https://gitlab.com/*', 'https://github.com/*'] } });
    await openSites(page);

    await expect(page.locator('#siteList li')).toHaveCount(2);
    await expect(page.locator('#siteList select')).toHaveCount(0);
});

// An update from 1.3.x that lost gitlab.com leaves the notice key for the popup.
async function openWithNotice(page) {
    await installChromeStub(page, { seed: { local: { gitlabComNotice: true } } });
    await page.goto('/src/popup/popup.html');
    const notice = page.locator('#gitlabComNotice');
    await expect(notice).toBeVisible();
    return notice;
}

test('the gitlab.com notice turns gitlab.com on', async ({ page }) => {
    const notice = await openWithNotice(page);

    await page.locator('#gitlabComOn').click();

    await expect(notice).toBeHidden();
    expect((await stubState(page)).requests).toEqual([['https://gitlab.com/*']]);
});

test('the gitlab.com notice can be dismissed', async ({ page }) => {
    const notice = await openWithNotice(page);

    await page.locator('#gitlabComDismiss').click();

    await expect(notice).toBeHidden();
    expect((await stubState(page)).local).toEqual({});
    expect((await stubState(page)).requests).toEqual([]);
});
