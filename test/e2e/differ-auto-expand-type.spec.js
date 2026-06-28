'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// FEAT-0029 Axis B: selecting the added serviceTask Task_2 auto-expands the
// "Implementation" group (its defining group for ServiceTask), even though Task_2 has
// no recorded diff group (Axis A empty) — proving the type-relevant axis. The panel
// marks an open group with the `open` class on its header element.
test('auto-expands the type-relevant group (ServiceTask → Implementation)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    // The panel is mounted by show().
    await expect(page.locator('.bio-properties-panel-scroll-container')).toBeVisible();

    // Select the added serviceTask on the canvas.
    await page.locator('svg .djs-element[data-element-id="Task_2"]').click();

    // Its Implementation group header gains the `open` class (auto-expanded). Locate
    // by header text (the live bio-properties-panel does NOT set a `title` attribute on
    // group-header titles — only the frozen unit fixture does; production matches by
    // textContent). Pattern matches the shipped differ-view-only.spec.js.
    const implHeader = page.locator('.bio-properties-panel-group-header', { hasText: 'Implementation' });
    await expect(implHeader).toHaveClass(/(^|\s)open(\s|$)/);
});
