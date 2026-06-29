'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, BASE_BPMN, ADDED_TASK_BPMN
} = require('./support/boot-differ');

// Local-file mode: localFileContent set, no sourceRef. isSourceVersionDefined() is
// true (so Switch/footer/☼ are enabled), the source side's role word is "Local"
// (BranchIndicator isLocalSource), and the source file path is INACTIVE — there is
// no sourceRef, so no blob URL exists for the uploaded file.
test('local-file mode: Local role, inactive source path, Switch enabled', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({
            sourceRef: undefined,
            localFileContent: ADDED_TASK_BPMN,
            sourceLabel: 'my-local.bpmn'
        }),
        fixtures: { xmlByRef: { 'base-sha': BASE_BPMN } }
    });

    await expect(page.locator('span', { hasText: 'Local · my-local.bpmn' })).toBeVisible();

    // The local (source) side has no repo ref → inactive, non-link path.
    const link = page.locator('a.differ-file-path');
    await expect(link).toHaveClass(/differ-file-path-inactive/);
    await expect(link).not.toHaveAttribute('href', /.+/);

    // A diff still exists (local vs base), so Switch is enabled.
    await expect(page.getByRole('button', { name: 'Switch branch' })).toBeEnabled();
});

// Rename mode (BUG-0002): targetFilePath differs from filePath, so the two sides
// show different paths/names. The source side shows the new path; switching shows
// the target side's old path. blobFileUrl is keyed by ref+path, so the hrefs differ
// in both ref and path.
test('rename mode: each side keeps its own path/name (BUG-0002)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({
            filePath: 'new-name.bpmn',
            fileName: 'new-name.bpmn',
            targetFilePath: 'old-name.bpmn'
        })
        // default fixtures: base-sha + mr-sha both resolve (fake keys by ref only)
    });

    const link = page.locator('a.differ-file-path');
    // MR side: the new path.
    await expect(link).toHaveAttribute('title', 'new-name.bpmn');
    await expect(link).toHaveAttribute('href', 'http://localhost/blob/mr-sha/new-name.bpmn');

    await page.getByRole('button', { name: 'Switch branch' }).click();

    // Target side: the old path/name (BUG-0002 — the target keeps its pre-rename name).
    await expect(link).toHaveAttribute('title', 'old-name.bpmn');
    await expect(link).toHaveAttribute('href', 'http://localhost/blob/base-sha/old-name.bpmn');
});
