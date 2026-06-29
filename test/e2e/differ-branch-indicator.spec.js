'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, BASE_BPMN, ADDED_TASK_BPMN
} = require('./support/boot-differ');

const DARK_BLUE = 'rgb(0, 0, 139)';
const DARK_RED = 'rgb(139, 0, 0)';
const GRAY = 'rgb(128, 128, 128)';

// Normal mode: the MR side (shown first) reads "Changed · <sourceLabel>" in
// darkblue; switching shows "Original · <targetLabel>" in darkred. The role word
// precedes every label so the side is clear without colour (FEAT-0026).
test('shows role words and side colours, normal then after Switch', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const changed = page.locator('span', { hasText: 'Changed · feature' });
    await expect(changed).toBeVisible();
    await expect(changed).toHaveCSS('color', DARK_BLUE);
    await expect(changed).toHaveCSS('font-style', 'normal');

    await page.getByRole('button', { name: 'Switch branch' }).click();

    const original = page.locator('span', { hasText: 'Original · master' });
    await expect(original).toBeVisible();
    await expect(original).toHaveCSS('color', DARK_RED);
    await expect(original).toHaveCSS('font-style', 'normal');
});

// New file in the MR (target absent): switching to the target side marks the
// absence in the label — "Original · master · file does not exist", italic gray.
test('marks an absent target side as a new file (italic gray)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': ADDED_TASK_BPMN } }   // base-sha absent
    });

    await page.getByRole('button', { name: 'Switch branch' }).click();

    const absent = page.locator('span', { hasText: 'file does not exist' });
    await expect(absent).toBeVisible();
    await expect(absent).toContainText('Original · master · file does not exist');
    await expect(absent).toHaveCSS('color', GRAY);
    await expect(absent).toHaveCSS('font-style', 'italic');
});

// File deleted in the MR (source absent but sourceRef defined): show() renders the
// target first; switching to the source side reads "Changed · feature · file
// deleted", italic gray.
test('marks an absent source side as a deleted file (italic gray)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'base-sha': BASE_BPMN } }   // mr-sha absent (deleted in MR)
    });

    await page.getByRole('button', { name: 'Switch branch' }).click();

    const deleted = page.locator('span', { hasText: 'file deleted' });
    await expect(deleted).toBeVisible();
    await expect(deleted).toContainText('Changed · feature · file deleted');
    await expect(deleted).toHaveCSS('color', GRAY);
    await expect(deleted).toHaveCSS('font-style', 'italic');
});

// Branch-only mode (no sourceRef, no localFileContent): only the target side
// exists, shown as "Original · <targetLabel>", normal (not absent).
test('shows the Original role in branch-only mode', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ sourceRef: undefined, sourceLabel: undefined }),
        fixtures: { xmlByRef: { 'base-sha': BASE_BPMN } }
    });

    const original = page.locator('span', { hasText: 'Original · master' });
    await expect(original).toBeVisible();
    await expect(original).toHaveCSS('color', DARK_RED);
    await expect(original).toHaveCSS('font-style', 'normal');
});
