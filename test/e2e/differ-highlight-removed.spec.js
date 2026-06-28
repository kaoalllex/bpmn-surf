'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, BASE_BPMN, ADDED_TASK_BPMN
} = require('./support/boot-differ');

// Mirror of the shipped "added" highlight test (differ-highlight.spec.js) with the
// versions swapped, to exercise the REMOVE direction the existing test never touches.
// The base (target) side has the extra Task_2; the MR removed it. show() renders the
// MR side first (2 elements, nothing to remove); "Switch branch" shows the base side,
// where Task_2 is REMOVED and is part of setDiffElementIds. Turning the diff highlight
// on (☼) marks it with the same `highlight-diff` class (the colour, red, comes from
// modeling.setColor + styles.css and is not asserted — the class is the robust signal).
test('marks a removed element when the highlight is on (base side)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'base-sha': ADDED_TASK_BPMN, 'mr-sha': BASE_BPMN } }
    });

    // MR side first: only 2 elements, Task_2 not present yet.
    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Switch branch' }).click();

    const removedTask = page.locator('svg .djs-element[data-element-id="Task_2"]');
    await expect(removedTask).toBeVisible();
    // Off by default.
    await expect(removedTask).not.toHaveClass(/highlight-diff/);

    await page.getByTitle('Turn diff highlight on').click();
    await expect(page.getByTitle('Turn diff highlight off')).toBeVisible();

    // The removed element now carries the highlight marker (pulse, then steady).
    await expect(removedTask).toHaveClass(/highlight-diff/);
    await expect(removedTask).toHaveClass(/(^|\s)highlight-diff(\s|$)/, { timeout: 3000 });
});
