'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// The changes table is populated after render but hidden (display:none) until
// "Show changes". For the MR side it lists the added Task_2 ('Notify',
// ServiceTask). Clicking that row adds the big highlight marker to the element.
test('lists changes and highlights the element on row click', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    // Reveal the table.
    await page.getByRole('button', { name: 'Show changes' }).click();
    await expect(page.getByRole('button', { name: 'Hide changes' })).toBeVisible();

    const table = page.locator('table.changes-table');
    await expect(table).toBeVisible();

    // The added Task_2 row carries its id, name, type and the "added" marker.
    const taskRow = table.locator('tbody tr', { hasText: 'Task_2' });
    await expect(taskRow).toBeVisible();
    await expect(taskRow).toContainText('Notify');
    await expect(taskRow).toContainText('ServiceTask');
    await expect(taskRow).toContainText('added');

    // Clicking the row highlights the element on the canvas (big marker).
    await taskRow.click();
    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]'))
        .toHaveClass(/highlight-diff-big/);
});
