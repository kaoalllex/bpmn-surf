'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// BUG-0022: the spec asked for a geometric guarantee that the toolbar is a single
// row. The toolbar is `display:flex; flex-wrap:nowrap; align-items:center`
// (styles.css `.differ-toolbar`), so controls of different heights (file-path <a>
// height ~22, buttons height ~34) are vertically CENTER-aligned — their tops
// legitimately differ by ~6px (=(34-22)/2) even in a single row. Tops are the
// wrong metric; vertical centers are the right one. We assert that the centers of
// the download, file path, Switch, Fit and Close controls share a single center
// line within a tight tolerance. A wrapped second row's center would be ~34px off —
// far outside 4px — so this guard still catches BUG-0022 regressions.
test('lays the toolbar controls out on a single row (equal centers)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const centers = [];
    for (const locator of [
        page.getByTitle('Download the file as shown for the current branch'),
        page.locator('a.differ-file-path'),
        page.getByRole('button', { name: 'Switch branch' }),
        page.getByTitle('Fit view'),
        page.getByTitle('Close', { exact: true }) // exact: true — 4c1 added search panel's 'Close (Esc)' button; substring would match both
    ]) {
        const box = await locator.boundingBox();
        centers.push(box.y + box.height / 2);
    }
    const min = Math.min(...centers);
    const max = Math.max(...centers);
    // With align-items:center + flex-wrap:nowrap, every control shares one vertical
    // center line, so centers coincide within ~1px on a single row. If the bar ever
    // wrapped to a second row, that row's center would be ~34px+ off — far outside
    // 4px. Tight center-based tolerance is both robust to height differences AND
    // still catches wrapping (the BUG-0022 guard).
    expect(max - min).toBeLessThanOrEqual(4);
});

// BUG-0021/UX-0005: the changes-table body scrolls within a fixed-height container
// (250px), so a long table never pushes the footer off-screen and a Switch branch
// that changes the row count does not resize the canvas. Reveal the table, then
// assert the wrapping div's height.
test('fixes the changes-table height at 250px', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    await page.getByRole('button', { name: 'Show changes' }).click();
    const table = page.locator('table.changes-table');
    await expect(table).toBeVisible();

    // The wrapping div carries the inline height (BUG-0021 needs the unit); the
    // two-row default scenario would be far shorter under a max-height.
    const wrapper = table.locator('xpath=..');
    await expect(wrapper).toHaveCSS('height', '250px');
});
