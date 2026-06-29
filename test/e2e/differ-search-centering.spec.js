'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, SEARCH_MULTI_BPMN } = require('./support/boot-differ');

const CANVAS = '#bpmnCanvas_12345bf3d4e842caa0d88194431197c0';

// The three "Check ..." tasks sit at different x positions. #goTo centers the
// viewport on the current match via canvas.viewbox(...), which rewrites the
// <g class="viewport"> transform matrix (the same attribute differ-zoom.spec.js
// reads). Stepping Enter from one match to the next must therefore change the
// transform. Centering on typing does NOT happen (the viewport stays still while
// the user types) — only explicit navigation recenters.
test('recenters the viewport on the current match when navigating', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { fixtures: { xmlByRef: { 'base-sha': SEARCH_MULTI_BPMN } } });

    const viewport = page.locator(`${CANVAS} svg .viewport`);
    // Ensure the transform matrix exists (it is set on the import-time fit, but
    // click Fit to be robust, exactly as differ-zoom.spec.js does).
    await page.getByTitle('Fit view').click();
    await expect(viewport).toHaveAttribute('transform', /matrix/);

    await page.keyboard.press('Control+f');
    const input = page.locator('input.search-panel-input');

    // Typing alone must not recenter the viewport — only navigation does.
    const beforeType = await viewport.getAttribute('transform');
    await input.fill('Check');
    const afterType = await viewport.getAttribute('transform');
    expect(afterType).toBe(beforeType);

    // First Enter → center on Task_A.
    await input.press('Enter');
    await expect.poll(() => viewport.getAttribute('transform')).not.toBe(afterType);
    const onFirst = await viewport.getAttribute('transform');

    // Next Enter → center on Task_B (a different position → a different matrix).
    await input.press('Enter');
    await expect.poll(() => viewport.getAttribute('transform')).not.toBe(onFirst);
});
