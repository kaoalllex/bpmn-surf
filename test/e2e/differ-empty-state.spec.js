'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, ADDED_TASK_BPMN
} = require('./support/boot-differ');

const CANVAS = '#bpmnCanvas_12345bf3d4e842caa0d88194431197c0';

// Both refs point at content the fake does not have → loadFileContent returns ''
// for each side → the differ shows the centered "absent in both" placeholder.
test('shows a placeholder when the file is absent in both versions', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ sourceRef: 'gone', targetRef: 'gone' })
    });

    await expect(page.locator('.differ-empty-state')).toBeVisible();
    await expect(page.locator('.differ-empty-state-message'))
        .toHaveText('File does not exist in either version');
    await expect(page.locator(`${CANVAS} svg .djs-element`)).toHaveCount(0);
});

// Only the MR side has the file (added in this MR). show() renders the MR; then
// switching to the target/base side (absent there) clears the canvas. Unlike the
// DMN differ, the BPMN absent side relies on bpmnJS.clear() and shows NO
// empty-state cover — it just empties the canvas and disables Download.
test('clears the canvas when switching to a side without the file', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { fixtures: { xmlByRef: { 'mr-sha': ADDED_TASK_BPMN } } });

    await expect(page.locator(`${CANVAS} svg .djs-element`).first()).toBeVisible();
    const download = page.getByTitle('Download the file as shown for the current branch');
    await expect(download).toBeEnabled();

    await page.getByRole('button', { name: 'Switch branch' }).click();

    await expect(page.locator(`${CANVAS} svg .djs-element`)).toHaveCount(0);
    await expect(download).toBeDisabled();
});
