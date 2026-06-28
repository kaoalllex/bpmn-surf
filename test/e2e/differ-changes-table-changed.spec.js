'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, BASE_BPMN, CHANGED_TASK_NAME_BPMN
} = require('./support/boot-differ');

// Task_1 renamed → a single CHANGED shape on the MR side. The footer counters are
// visible without revealing the table body: "Changed: 1 elements (0 rows)" and, since
// nothing was added, the dynamic label stays "Added:" with "0 elements (0 rows)".
// Revealing the table shows one "changed" row for Task_1.
test('shows a changed row and the changed/added counters', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: { xmlByRef: { 'base-sha': BASE_BPMN, 'mr-sha': CHANGED_TASK_NAME_BPMN } }
    });

    // Counters are visible immediately (only the table body is hidden).
    await expect(page.locator('td:has-text("Changed:") + td')).toHaveText('1 elements (0 rows)');
    await expect(page.locator('td:has-text("Added:") + td')).toHaveText('0 elements (0 rows)');

    await page.getByRole('button', { name: 'Show changes' }).click();
    const table = page.locator('table.changes-table');
    await expect(table).toBeVisible();

    const row = table.locator('tbody tr', { hasText: 'Task_1' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('changed');
    await expect(row).toContainText('Approve request');
    await expect(row).toContainText('UserTask');
});
