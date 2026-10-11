'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, defaultBpmnParams } = require('./support/boot-differ');

const DOWNLOAD_TITLE = 'Download the file as shown for the current branch';

// Clicking Download builds an <a download="${label}-${fileName}"> and clicks it.
// On the MR side (shown first) that is "feature-diagram.bpmn". Playwright surfaces
// this as a `download` event with that suggested filename.
test('downloads the shown side with a branch-prefixed filename', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByTitle(DOWNLOAD_TITLE).click()
    ]);
    expect(download.suggestedFilename()).toBe('feature-diagram.bpmn');
});

// BUG-0001: file absent in both versions → the empty-state placeholder shows and
// Download is disabled (nothing to download on either side).
test('disables Download when the file is absent in both versions', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ sourceRef: 'gone', targetRef: 'gone' })
    });

    await expect(page.locator('.differ-empty-state')).toBeVisible();
    await expect(page.getByTitle(DOWNLOAD_TITLE)).toBeDisabled();
});

// The icon is a floppy disk drawn by CSS (a mask over currentColor), not a glyph;
// the button keeps a spelled-out accessible name.
test('the download button shows a floppy-disk icon', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const button = page.getByRole('button', { name: DOWNLOAD_TITLE });
    await expect(button).toHaveText('');
    const icon = await button.evaluate((element) => {
        const style = getComputedStyle(element, '::before');
        return { mask: style.maskImage || style.webkitMaskImage, width: style.width };
    });
    expect(icon.mask).toContain('data:image/svg+xml');
    expect(icon.width).toBe('16px');
});
