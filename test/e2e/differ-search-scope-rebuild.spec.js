'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// No match: the counter shows "0" and nothing is marked.
test('shows the 0 counter and no markers when nothing matches', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    await page.keyboard.press('Control+f');
    const input = page.locator('input.search-panel-input');
    await input.fill('zzznomatch');

    await expect(page.locator('.search-panel-counter')).toHaveText('0');
    await expect(page.locator('svg .search-match')).toHaveCount(0);
});

// Parameter-scope (FEAT-0006/BUG-0007): ElementSearcher indexes parameter values,
// not just name/id. Flow_2 has no name but its conditionExpression is
// "${approved == true}", so searching "approved" matches the sequence flow —
// something the viewer's name/id-only search could never find.
test('matches a sequence flow by its condition expression (parameter scope)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    await page.keyboard.press('Control+f');
    const input = page.locator('input.search-panel-input');
    await input.fill('approved');

    await expect(page.locator('svg .djs-element[data-element-id="Flow_2"]'))
        .toHaveClass(/search-match/);
    await expect(page.locator('.search-panel-counter')).toHaveText('1');
});

// Index rebuild on Switch: "Notify" (Task_2) exists only in the MR side. With the
// panel open, switching to the base side runs #showXml → searchPanel.rebuildIndex,
// which re-indexes the freshly imported (base) diagram and re-runs the search with
// the kept input — now 0 matches, so the counter drops to "0".
test('rebuilds the search index on Switch branch (match disappears on the other side)', async ({ page }) => {
    wireDiagnostics(page);
    // At the default 1280px width the centered search panel (position:fixed,
    // left:50%, z-index:10001) occludes the right-pinned "Switch branch" button,
    // so a real click can't reach it while the panel is open (a known UX nuance).
    // Widen the viewport so the panel and the button no longer overlap and the
    // switch is driven by a real user-style click.
    await page.setViewportSize({ width: 1600, height: 720 });
    await bootBpmnDiffer(page);

    await page.keyboard.press('Control+f');
    const input = page.locator('input.search-panel-input');
    await input.fill('Notify');
    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]'))
        .toHaveClass(/search-match/);
    await expect(page.locator('.search-panel-counter')).toHaveText('1');

    await page.getByRole('button', { name: 'Switch branch' }).click();

    // Task_2 is absent on the base side; the rebuilt index yields no hit.
    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]')).toHaveCount(0);
    await expect(page.locator('.search-panel-counter')).toHaveText('0');
    await expect(page.locator('svg .search-match')).toHaveCount(0);
});

// Blank query: the counter is cleared entirely — distinct from the "0" shown
// for a non-empty query that matches nothing (covers the last #updateCounter
// branch).
test('clears the counter for a blank query', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    await page.keyboard.press('Control+f');
    const input = page.locator('input.search-panel-input');
    const counter = page.locator('.search-panel-counter');

    await input.fill('Notify');
    await expect(counter).toHaveText('1');

    await input.fill('');
    await expect(counter).toHaveText('');
    await expect(page.locator('svg .search-match')).toHaveCount(0);
});
