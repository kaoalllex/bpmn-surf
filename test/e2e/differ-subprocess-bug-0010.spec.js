'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, SUBPROCESS_BASE_BPMN, SUBPROCESS_CHANGED_CHILD_BPMN
} = require('./support/boot-differ');

// BUG-0010 (still OPEN) regression pin. Only InnerTask_1's name changed inside the
// expanded SubProcess_1. The comparator excludes a subprocess's children from the
// subprocess's own diff, so changedShapeIds = [InnerTask_1] only — the enclosing
// SubProcess_1 is NOT flagged: no changes-table row, no highlight marker. This locks
// the current (acknowledged-buggy) behaviour end-to-end, mirroring the unit test
// "flags a changed inner element but not the enclosing subprocess". WHEN BUG-0010 IS
// FIXED THIS TEST IS EXPECTED TO GO RED — update it (and that unit test) then; do NOT
// loosen it before the fix.
test('BUG-0010: highlights the changed child but not its enclosing subprocess', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: { xmlByRef: { 'base-sha': SUBPROCESS_BASE_BPMN, 'mr-sha': SUBPROCESS_CHANGED_CHILD_BPMN } }
    });

    // Reveal the changes table.
    await page.getByRole('button', { name: 'Show changes' }).click();
    const table = page.locator('table.changes-table');
    await expect(table).toBeVisible();

    // The changed child is listed as "changed"; the subprocess is NOT listed.
    const childRow = table.locator('tbody tr', { hasText: 'InnerTask_1' });
    await expect(childRow).toBeVisible();
    await expect(childRow).toContainText('changed');
    await expect(table.locator('tbody tr', { hasText: 'SubProcess_1' })).toHaveCount(0);

    // Counter: exactly one changed shape, no changed rows; nothing added.
    await expect(page.locator('td:has-text("Changed:") + td')).toHaveText('1 elements (0 rows)');

    // On the canvas, turning the highlight on marks the child but never the subprocess.
    await page.getByTitle('Turn diff highlight on').click();
    await expect(page.locator('svg .djs-element[data-element-id="InnerTask_1"]'))
        .toHaveClass(/highlight-diff/);
    await expect(page.locator('svg .djs-element[data-element-id="SubProcess_1"]'))
        .not.toHaveClass(/highlight-diff/);
});
