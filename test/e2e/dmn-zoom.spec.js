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

// A table that already fits keeps its zoom: "Show full" never enlarges it.
test('Show full leaves a table that already fits as it is', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page);

    const container = page.locator('.tjs-table-container');
    const zoom = async () => parseFloat(await container.evaluate((el) => el.style.zoom));
    await expect.poll(zoom).toBe(100);

    await page.getByRole('button', { name: 'Show full' }).click();

    expect(await zoom()).toBe(100);
});

// "Show full" steps down from the current zoom until the whole table fits the
// window: a short window makes 100% overflow, so the step-down has to run.
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
    // ...and not clipped by its own scroll container: nothing left to scroll to.
    expect(await container.evaluate((el) => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth))
        .toBe(true);
});

// 8 columns × 100 rules: wider than the window at dmn-js's 192px per column, and
// far taller than it.
function wideLongDmn() {
    const inputs = [...Array(7).keys()].map((i) =>
        `<input id="Input_${i}" label="Input ${i}"><inputExpression id="InputExpression_${i}" typeRef="string"><text>in${i}</text></inputExpression></input>`);
    const rules = [...Array(100).keys()].map((r) =>
        `<rule id="Rule_${r}">${[...Array(7).keys()].map((i) => `<inputEntry id="In_${r}_${i}"><text>"VALUE_${r}_${i}"</text></inputEntry>`).join('')}` +
        `<outputEntry id="Out_${r}"><text>"RESULT_${r}"</text></outputEntry></rule>`);
    return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="Definitions_1" name="wide" namespace="http://camunda.org/schema/1.0/dmn">
  <decision id="Decision_1" name="Wide"><decisionTable id="DecisionTable_1" hitPolicy="FIRST">
    ${inputs.join('')}<output id="Output_1" label="Result" name="result" typeRef="string" />${rules.join('')}
  </decisionTable></decision>
</definitions>`;
}

// The table always spans the window's width — the zoom scales the text and the row
// height, never the width — and the rows scroll inside the window.
test('a wide, long table keeps the window width at every zoom and scrolls inside the window', async ({ page }) => {
    wireDiagnostics(page);
    await page.setViewportSize({ width: 1200, height: 700 });
    const xml = wideLongDmn();
    await bootDmnDiffer(page, { fixtures: { xmlByRef: { 'base-sha': xml, 'mr-sha': xml } } });

    const container = page.locator('.tjs-table-container');
    const layout = () => page.evaluate(() => {
        const table = document.querySelector('.tjs-table').getBoundingClientRect();
        const scroller = document.querySelector('.tjs-table-container');
        return {
            tableWidth: table.width,
            tableRight: table.right,
            scrollerBottom: scroller.getBoundingClientRect().bottom,
            scrolls: scroller.scrollHeight > scroller.clientHeight
        };
    });
    const spansWindow = (l) => l.tableRight <= 1200 && l.tableWidth >= 1200 * 0.95;

    await expect.poll(async () => parseFloat(await container.evaluate((el) => el.style.zoom))).toBe(100);
    const fitted = await layout();
    expect(spansWindow(fitted), JSON.stringify(fitted)).toBe(true);
    expect(fitted.scrollerBottom).toBeLessThanOrEqual(700);
    expect(fitted.scrolls).toBe(true);

    for (let i = 0; i < 4; i++) {
        await page.getByTitle('Zoom in').click();
    }
    const zoomedIn = await layout();
    expect(spansWindow(zoomedIn), JSON.stringify(zoomedIn)).toBe(true);

    await page.getByRole('button', { name: 'Show full' }).click();
    const full = await layout();
    expect(spansWindow(full), JSON.stringify(full)).toBe(true);
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
