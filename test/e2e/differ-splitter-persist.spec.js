'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

const PROPS_ID = '#bpmnProps_12345bf3d4e842caa0d88194431197c0';
const WIDTH_KEY = 'bpmnDiffer.propsWidth';

// UX-0007: dragging the splitter resizes the properties panel and persists the
// width to localStorage; a reload restores it. The props <td> is the parent of the
// props inner div. Dragging the splitter LEFT (smaller clientX) widens the panel
// (width = innerWidth - clientX), so the stored width exceeds the 340px default.
test('persists the dragged properties-panel width across reload', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const propsCell = page.locator(PROPS_ID).locator('xpath=..');
    const splitter = page.locator('.differ-splitter');
    await expect(splitter).toBeVisible();

    const box = await splitter.boundingBox();
    const cy = box.y + box.height / 2;
    const cx = box.x + box.width / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 80, cy, { steps: 5 });   // drag left → wider panel
    await page.mouse.up();

    const stored = await page.evaluate((k) => localStorage.getItem(k), WIDTH_KEY);
    expect(Number(stored)).toBeGreaterThan(340);

    // Reload (same context → same localStorage): the width is restored on build.
    await bootBpmnDiffer(page);
    const restored = await page.evaluate((k) => localStorage.getItem(k), WIDTH_KEY);
    expect(restored).toBe(stored);
    const width = await page.locator(PROPS_ID).locator('xpath=..').evaluate((el) => el.style.width);
    expect(width).toBe(stored + 'px');
});
