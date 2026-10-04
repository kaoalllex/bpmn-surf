'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, SUBPROCESS_BASE_BPMN, SUBPROCESS_CHANGED_CHILD_BPMN
} = require('./support/boot-differ');

// BUG-0010. Only DeepTask_1's name changed; it sits in the collapsed CollapsedSub_1,
// which sits in the expanded SubProcess_1. The leaf keeps the CHANGE fill and is the
// only changes-table row; both enclosing subprocesses get the CHANGE stroke (they
// contain changes but are not changed themselves) and join the ☼ highlight.
test('BUG-0010: marks every subprocess enclosing a changed child', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: { xmlByRef: { 'base-sha': SUBPROCESS_BASE_BPMN, 'mr-sha': SUBPROCESS_CHANGED_CHILD_BPMN } }
    });

    const element = (id) => page.locator(`svg .djs-element[data-element-id="${id}"]`);
    // DiffType.CHANGE: shapeColor #8888ff (fill), rowColor #0000aa (stroke).
    for (const id of ['SubProcess_1', 'CollapsedSub_1']) {
        const visual = element(id).locator('.djs-visual > rect').first();
        await expect(visual).toHaveCSS('stroke', 'rgb(0, 0, 170)');
        await expect(visual).not.toHaveCSS('fill', 'rgb(136, 136, 255)');
    }
    await expect(element('InnerTask_1').locator('.djs-visual > rect'))
        .not.toHaveCSS('stroke', 'rgb(0, 0, 170)');

    // The counter counts the leaf only; on the top plane the list shows it as a
    // change inside the collapsed subprocess holding it (the expanded one is not
    // a plane of its own, so it gets no row).
    await page.getByRole('button', { name: 'Show changes' }).click();
    const table = page.locator('table.changes-table');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(table.locator('tbody tr', { hasText: 'CollapsedSub_1' })).toContainText('1 change inside');
    await expect(page.locator('td:has-text("Changed:") + td')).toHaveText('1');

    await page.getByTitle('Turn diff highlight on').click();
    await expect(element('SubProcess_1')).toHaveClass(/highlight-diff/);
    await expect(element('CollapsedSub_1')).toHaveClass(/highlight-diff/);
    await expect(element('InnerTask_1')).not.toHaveClass(/highlight-diff/);

    // Drilling into the collapsed subprocess shows the changed leaf filled.
    await page.getByRole('button', { name: 'Open Sign UZ' }).click();
    const leaf = element('DeepTask_1');
    await expect(leaf).toBeVisible();
    await expect(leaf.locator('.djs-visual > rect')).toHaveCSS('fill', 'rgb(136, 136, 255)');
});
