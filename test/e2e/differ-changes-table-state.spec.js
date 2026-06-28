'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, ADDED_TASK_BPMN
} = require('./support/boot-differ');

// Default scenario (MR side, Task_2 added). Selecting a changes-table row adds the
// big marker (highlight-diff-big) to the element; HIDING the table calls
// resetSelection(), which removes that marker.
test('resetSelection removes the big marker when the table is hidden', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    await page.getByRole('button', { name: 'Show changes' }).click();
    const taskRow = page.locator('table.changes-table tbody tr', { hasText: 'Task_2' });
    await taskRow.click();

    const addedTask = page.locator('svg .djs-element[data-element-id="Task_2"]');
    await expect(addedTask).toHaveClass(/highlight-diff-big/);

    await page.getByRole('button', { name: 'Hide changes' }).click();
    await expect(addedTask).not.toHaveClass(/highlight-diff-big/);
});

// New file in the MR (base-sha absent). NOTE (corrected during execution): with the
// target side absent there is no base to diff against, so #showMr computes diff=null
// and the changes table is NEVER populated — not even on the MR side (you cannot diff a
// new file). So clear() always clears an already-empty table; we therefore characterize
// the absent-SIDE end-state instead of a populated→empty transition. Switching to the
// absent base side runs #showAbsentSide → bpmnJS.clear() (canvas emptied — BPMN shows NO
// cover for a one-sided absence, unlike DMN) + changesTableView.clear() + disable
// Download/Highlight + the "file does not exist" label.
test('clears the canvas and changes table when switching to an absent (new-file) side', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': ADDED_TASK_BPMN } }   // base-sha missing → absent target (new file in MR)
    });

    // MR side renders the diagram (no diff computed — there is no base to compare).
    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]')).toBeVisible();

    // Switch to the absent base side → #showAbsentSide → bpmnJS.clear() + changesTable.clear().
    await page.getByRole('button', { name: 'Switch branch' }).click();

    // The canvas is cleared (no cover for a one-sided absence, unlike DMN); the Task_2
    // shape that was just visible is gone.
    await expect(page.locator('svg .djs-element')).toHaveCount(0);
    // The changes table is empty and the changed counter is blank.
    await expect(page.locator('table.changes-table tbody tr')).toHaveCount(0);
    await expect(page.locator('td:has-text("Changed:") + td')).toHaveText('');

    // The absence is spelled out in the label (italic, grey); Download and Highlight disable.
    const indicator = page.locator('.differ-toolbar span', { hasText: '·' });
    await expect(indicator).toContainText('file does not exist');
    await expect(indicator).toHaveCSS('color', 'rgb(128, 128, 128)');
    await expect(indicator).toHaveCSS('font-style', 'italic');
    await expect(page.getByTitle('Download the file as shown for the current branch')).toBeDisabled();
    await expect(page.getByTitle('Turn diff highlight on')).toBeDisabled();
});
