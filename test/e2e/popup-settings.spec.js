'use strict';

const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { installChromeStub, stubState } = require('./support/popup-chrome-stub');

// The annotations screen and the settings file of the popup over a stateful chrome.*.

test('adds and removes handler annotations in chrome.storage.sync', async ({ page }) => {
    await installChromeStub(page);
    await page.goto('/src/popup/popup.html');
    await page.click('[data-open="annotations"]');
    const topics = page.locator('#topicAnnList li');
    await expect(topics).toHaveText(['@ExternalTaskSubscription×', '@JobWorker×']);

    await page.fill('#topicAnnInput', '@ZeebeWorker');
    await page.locator('#addTopicAnnForm button[type="submit"]').click();
    await expect(topics).toHaveCount(3);
    await expect(page.locator('#topicAnnInput')).toHaveValue('');

    await page.fill('#topicAnnInput', 'JobWorker');
    await page.locator('#addTopicAnnForm button[type="submit"]').click();
    await expect(page.locator('#annError')).toHaveText('That annotation is already listed');

    await page.fill('#classAnnInput', 'ExternalTaskBean');
    await page.locator('#addClassAnnForm button[type="submit"]').click();
    await expect(page.locator('#classAnnList li')).toHaveText(/@ExternalTaskBean/);

    await topics.filter({ hasText: '@ExternalTaskSubscription' }).locator('button').click();
    await expect(topics).toHaveCount(2);
    await expect.poll(async () => (await stubState(page)).sync.settings.handlerAnnotations)
        .toEqual({ topic: ['JobWorker', 'ZeebeWorker'], className: ['ExternalTaskBean'] });

    await page.click('#backBtn');
    await expect(page.locator('#annSummary')).toHaveText('@JobWorker, @ZeebeWorker, @ExternalTaskBean');
});

test('exports the settings and imports them into a fresh profile', async ({ page, browser }, testInfo) => {
    await installChromeStub(page, {
        seed: {
            origins: ['https://gitlab.example.com/*'],
            sync: { settings: { handlerAnnotations: { topic: ['JobWorker'], className: [] }, siteKinds: { 'gitlab.example.com': 'gitlab' } } }
        }
    });
    await page.goto('/src/popup/popup.html');
    await page.click('[data-open="file"]');

    const downloadEvent = page.waitForEvent('download');
    await page.click('#exportBtn');
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe('bpmn-surf-settings.json');
    const file = testInfo.outputPath('bpmn-surf-settings.json');
    await download.saveAs(file);
    const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(exported.hosts).toEqual(['gitlab.example.com']);
    expect(exported.siteKinds).toEqual({ 'gitlab.example.com': 'gitlab' });
    expect(exported.handlerAnnotations).toEqual({ topic: ['JobWorker'], className: [] });
    expect(exported.exportedBy).toBe('bpmn-surf 9.9.9');

    // A colleague's popup: nothing granted, nothing stored.
    const fresh = await browser.newPage();
    await installChromeStub(fresh);
    await fresh.goto(page.url());
    await fresh.click('[data-open="file"]');
    await fresh.setInputFiles('#importInput', file);

    const grant = fresh.locator('#grantImportedBtn');
    await expect(grant).toHaveText('Allow gitlab.example.com');
    await expect(fresh.locator('#ioNote')).toHaveText('Annotations imported. The sites still need your permission.');
    expect((await stubState(fresh)).sync.settings.handlerAnnotations).toEqual({ topic: ['JobWorker'], className: [] });
    expect((await stubState(fresh)).requests).toEqual([]);

    await grant.click();
    await expect(fresh.locator('#ioNote')).toHaveText('Sites allowed.');
    expect((await stubState(fresh)).requests).toEqual([['https://gitlab.example.com/*']]);
    await fresh.click('#backBtn');
    await expect(fresh.locator('#sitesSummary')).toHaveText('gitlab.example.com');
});

test('reports a file that is not a settings file', async ({ page }, testInfo) => {
    await installChromeStub(page);
    await page.goto('/src/popup/popup.html');
    await page.click('[data-open="file"]');
    const file = testInfo.outputPath('garbage.json');
    fs.writeFileSync(file, 'not json');

    await page.setInputFiles('#importInput', file);

    await expect(page.locator('#ioError')).toContainText('Cannot import:');
    expect((await stubState(page)).sync).toEqual({});
});
