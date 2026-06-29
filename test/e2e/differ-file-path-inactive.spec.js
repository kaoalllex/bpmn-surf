'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, ADDED_TASK_BPMN
} = require('./support/boot-differ');

// BUG-0020: new file in the MR (base-sha absent). The MR side links normally;
// switching to the absent target side runs #showAbsentSide → setShownFile with a
// null url (the blob would 404), so the path renders inactive — `href` removed and
// the `differ-file-path-inactive` class added.
test('renders the file path inactive when the shown version is absent', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': ADDED_TASK_BPMN } }   // base-sha missing → new file in MR
    });

    const link = page.locator('a.differ-file-path');
    // MR side present → active link.
    await expect(link).toHaveAttribute('href', 'http://localhost/blob/mr-sha/diagram.bpmn');
    await expect(link).not.toHaveClass(/differ-file-path-inactive/);

    await page.getByRole('button', { name: 'Switch branch' }).click();

    // Absent target side → inactive, non-link path.
    await expect(link).toHaveClass(/differ-file-path-inactive/);
    await expect(link).not.toHaveAttribute('href', /.+/);
});
