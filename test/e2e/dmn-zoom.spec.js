'use strict';

const { test, expect } = require('@playwright/test');
const { bootDmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// The DMN table has no canvas: DmnTableViewport zooms the table container through
// its CSS `zoom`, which is what the toolbar buttons rewrite.
test('zooms in and out and fits at 100%', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page);

    const container = page.locator('.tjs-table-container');
    await expect(container).toHaveCount(1);
    const zoom = async () => parseFloat(await container.evaluate((el) => el.style.zoom));

    await expect.poll(zoom).toBe(100);

    await page.getByTitle('Zoom in').click();
    await expect.poll(zoom).toBeGreaterThan(100);
    const zoomedIn = await zoom();

    await page.getByTitle('Zoom out').click();
    await expect.poll(zoom).toBeLessThan(zoomedIn);

    await page.getByTitle('Fit view').click();
    await expect.poll(zoom).toBe(100);
});

// "Show full" starts at the 300% maximum and steps down until the whole table fits
// the window: a short window makes the maximum overflow, so the step-down has to run.
test('Show full shrinks the table until it fits a short window', async ({ page }) => {
    wireDiagnostics(page);
    await page.setViewportSize({ width: 1000, height: 320 });
    await bootDmnDiffer(page);

    const container = page.locator('.tjs-table-container');
    const zoom = async () => parseFloat(await container.evaluate((el) => el.style.zoom));
    await expect.poll(zoom).toBe(100);

    await page.getByRole('button', { name: 'Show full' }).click();

    // The whole table inside the window, below the 300% it starts from.
    const fitsWindow = () => page.locator('.tjs-table').evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
    });
    await expect.poll(fitsWindow).toBe(true);
    const shown = await zoom();
    expect(shown).toBeLessThan(300);
});

// A table that overflows the window even at the minimum zoom must not hang the tab.
test('Show full stops at the minimum zoom when nothing fits', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page);
    // Shrunk after the boot, so the table's top edge alone lies below the window.
    await page.setViewportSize({ width: 1000, height: 40 });

    const container = page.locator('.tjs-table-container');
    await page.getByRole('button', { name: 'Show full' }).click({ force: true, timeout: 5000 });

    await expect.poll(async () => parseFloat(await container.evaluate((el) => el.style.zoom)), { timeout: 5000 })
        .toBe(10);
});
