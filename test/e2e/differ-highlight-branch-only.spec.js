'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, BASE_BPMN
} = require('./support/boot-differ');

// Branch-only mode: no sourceRef and no localFileContent → isSourceVersionDefined()
// is false, so there is no diff to highlight. The ☼ Highlight button and "Switch
// branch" must be disabled, and no footer (changes table) is built (BUG-0025: before
// the fix, #showXml re-enabled ☼ unconditionally on render). The "mr ... is undefined"
// debug line is normal.
test('disables highlight and switch and omits the footer in branch-only mode', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ sourceRef: undefined, sourceLabel: undefined }),
        fixtures: { xmlByRef: { 'base-sha': BASE_BPMN } }
    });

    // The target diagram still renders.
    await expect(page.locator('svg .djs-element[data-element-id="Task_1"]')).toBeVisible();

    // Diff highlight cannot be turned on (no comparison side) — BUG-0025.
    await expect(page.getByTitle('Turn diff highlight on')).toBeDisabled();
    // There is nothing to switch to.
    await expect(page.getByRole('button', { name: 'Switch branch' })).toBeDisabled();
    // No footer → no changes table.
    await expect(page.getByRole('button', { name: 'Show changes' })).toHaveCount(0);
    await expect(page.locator('table.changes-table')).toHaveCount(0);
});
