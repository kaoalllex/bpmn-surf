'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, SUBPROCESS_BASE_BPMN, SUBPROCESS_CHANGED_CHILD_BPMN
} = require('./support/boot-differ');

// The changes table is populated after render but hidden (display:none) until
// "Show changes". For the MR side it lists the added Task_2 ('Notify',
// ServiceTask). Clicking that row adds the big highlight marker to the element
// and selects it, so the properties panel shows it.
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
    await expect(taskRow.locator('.changes-table-type')).toHaveAttribute('title', 'ServiceTask');
    await expect(taskRow.locator('.changes-table-badge')).toHaveAttribute('title', 'added');

    // Clicking the row highlights the element on the canvas (big marker).
    await taskRow.click();
    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]'))
        .toHaveClass(/(^|\s)highlight-diff-big(\s|$)/);
    await expect(taskRow).toHaveClass(/(^|\s)selected(\s|$)/);
    await expect(page.locator('.bio-properties-panel-header-label')).toHaveText('Notify');
});

// DeepTask_1 sits in a collapsed subprocess, i.e. on another plane: clicking its row
// drills into that plane, so the element is on screen and selected.
test('row click drills into the collapsed subprocess holding the element', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: { xmlByRef: { 'base-sha': SUBPROCESS_BASE_BPMN, 'mr-sha': SUBPROCESS_CHANGED_CHILD_BPMN } }
    });

    const leaf = page.locator('svg .djs-element[data-element-id="DeepTask_1"]');
    await expect(leaf).toBeHidden();

    await page.getByRole('button', { name: 'Show changes' }).click();
    await page.locator('table.changes-table tbody tr', { hasText: 'DeepTask_1' }).click();

    await expect(leaf).toBeVisible();
    await expect(leaf).toHaveClass(/(^|\s)selected(\s|$)/);
});
