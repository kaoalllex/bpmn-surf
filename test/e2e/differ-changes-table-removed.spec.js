'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, BASE_BPMN, ADDED_TASK_BPMN
} = require('./support/boot-differ');

// Swapped refs: the base (target) side has Task_2 (shape) + Flow_3 (row); the MR removed
// them. show() renders the MR side first (nothing removed there). After Switch, the base
// side fills the table for the REMOVE direction: the dynamic label becomes "Removed:",
// the counter "2" (Task_2 shape + Flow_3 connection), and both are listed as "removed",
// the connection named by its ends.
test('shows a removed row and the removed counter after switching (base side)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'base-sha': ADDED_TASK_BPMN, 'mr-sha': BASE_BPMN } }
    });

    await page.getByRole('button', { name: 'Switch branch' }).click();

    await expect(page.locator('td:has-text("Removed:") + td')).toHaveText('2');
    await expect(page.locator('td:has-text("Changed:") + td')).toHaveText('0');

    await page.getByRole('button', { name: 'Show changes' }).click();
    const table = page.locator('table.changes-table');
    await expect(table).toBeVisible();

    const row = table.locator('tbody tr', { hasText: 'Task_2' });
    await expect(row).toBeVisible();
    await expect(row.locator('.changes-table-badge')).toHaveAttribute('title', 'removed');
    await expect(row).toContainText('Notify');
    await expect(row.locator('.changes-table-type')).toHaveAttribute('title', 'ServiceTask');

    const flowRow = table.locator('tbody tr', { hasText: 'Flow_3' });
    await expect(flowRow.locator('td').nth(1)).toHaveText('Review request → NotifyFlow_3');
    await expect(flowRow.locator('.changes-table-type')).toHaveAttribute('title', 'SequenceFlow');
});
