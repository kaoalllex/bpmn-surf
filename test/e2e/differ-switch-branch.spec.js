'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, SUBPROCESS_BASE_BPMN, SUBPROCESS_CHANGED_CHILD_BPMN
} = require('./support/boot-differ');

// show() renders the MR side first (Task_2 present, indicator "Changed ·
// feature"). Clicking "Switch branch" shows the target/base side, where Task_2
// does not exist and the indicator reads "Original · master".
test('switches between the MR and target versions', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const addedTask = page.locator('svg .djs-element[data-element-id="Task_2"]');
    const indicator = page.locator('.differ-toolbar span', { hasText: '·' });

    // MR side first: added element present, source label shown.
    await expect(addedTask).toBeVisible();
    await expect(indicator).toContainText('Changed · feature');

    await page.getByRole('button', { name: 'Switch branch' }).click();

    // Target/base side: the added element is gone, target label shown.
    await expect(addedTask).toHaveCount(0);
    await expect(indicator).toContainText('Original · master');

    // And back.
    await page.getByRole('button', { name: 'Switch branch' }).click();
    await expect(addedTask).toBeVisible();
    await expect(indicator).toContainText('Changed · feature');
});

// Drilled into a collapsed subprocess, Switch branch re-imports the other version;
// the view stays in that subprocess's plane instead of jumping to the root process.
test('stays in the drilled-into subprocess across a switch', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: { xmlByRef: { 'base-sha': SUBPROCESS_BASE_BPMN, 'mr-sha': SUBPROCESS_CHANGED_CHILD_BPMN } }
    });

    const breadcrumbs = page.locator('.bjs-breadcrumbs');
    const leaf = page.locator('svg .djs-element[data-element-id="DeepTask_1"]');
    const indicator = page.locator('.differ-toolbar span', { hasText: '·' });

    await page.getByRole('button', { name: 'Open Sign UZ' }).click();
    await expect(breadcrumbs).toContainText('Sign UZ');

    await page.getByRole('button', { name: 'Switch branch' }).click();
    await expect(indicator).toContainText('Original · master');
    await expect(breadcrumbs).toContainText('Sign UZ');
    await expect(leaf).toBeVisible();
    await expect(leaf.locator('.djs-visual > rect')).toHaveCSS('fill', 'rgb(136, 136, 255)');

    await page.getByRole('button', { name: 'Switch branch' }).click();
    await expect(indicator).toContainText('Changed · feature');
    await expect(breadcrumbs).toContainText('Sign UZ');
    await expect(leaf).toBeVisible();

    // Back up to the root: the whole process is in view, not the subprocess's viewbox.
    await breadcrumbs.locator('li').first().click();
    await expect(page.locator('svg .djs-element[data-element-id="StartEvent_1"]')).toBeInViewport();
    await expect(page.locator('svg .djs-element[data-element-id="EndEvent_1"]')).toBeInViewport();
});

// The other version has no such subprocess: the switch falls back to the root process.
test('falls back to the root process when the other version lacks the subprocess', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: { xmlByRef: {
            'base-sha': SUBPROCESS_BASE_BPMN.replaceAll('CollapsedSub_1', 'OtherSub_1'),
            'mr-sha': SUBPROCESS_CHANGED_CHILD_BPMN
        } }
    });

    await page.getByRole('button', { name: 'Open Sign UZ' }).click();
    await expect(page.locator('.bjs-breadcrumbs')).toContainText('Sign UZ');

    await page.getByRole('button', { name: 'Switch branch' }).click();
    await expect(page.locator('.differ-toolbar span', { hasText: '·' })).toContainText('Original · master');
    await expect(page.locator('.bjs-breadcrumbs')).not.toContainText('Sign UZ');
    await expect(page.locator('svg .djs-element[data-element-id="InnerTask_1"]')).toBeVisible();
});
