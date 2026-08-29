'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, BASE_BPMN, CHANGED_TASK_NAME_BPMN
} = require('./support/boot-differ');

// changed-task-name.bpmn keeps base's structure but renames Task_1
// ("Review request" → "Approve request"). compare(mr, branch) flags Task_1 as a
// CHANGED shape (changedShapeIds), so it joins setDiffElementIds. Turning the diff
// highlight on (☼) marks it with `highlight-diff` — exercising the changed direction
// that the shipped added-only test never covers. The CHANGE colour is painted at load,
// before any toggle (REFAC-0015 §1).
test('marks a changed element when the highlight is on (MR side)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: { xmlByRef: { 'base-sha': BASE_BPMN, 'mr-sha': CHANGED_TASK_NAME_BPMN } }
    });

    const changedTask = page.locator('svg .djs-element[data-element-id="Task_1"]');
    await expect(changedTask).toBeVisible();
    // DiffType.CHANGE.shapeColor #8888ff, set inline by modeling.setColor.
    await expect(changedTask.locator('.djs-visual > rect'))
        .toHaveCSS('fill', 'rgb(136, 136, 255)');
    await expect(changedTask).not.toHaveClass(/highlight-diff/);

    await page.getByTitle('Turn diff highlight on').click();
    await expect(page.getByTitle('Turn diff highlight off')).toBeVisible();

    await expect(changedTask).toHaveClass(/highlight-diff/);
    await expect(changedTask).toHaveClass(/(^|\s)highlight-diff(\s|$)/, { timeout: 3000 });
});
