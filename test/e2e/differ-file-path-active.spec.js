'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

const LRM = '‎';

// FEAT-0026: the header file path is a real <a> opening the file in the shown
// version. On the MR side (rendered first) it links to the source ref's blob; the
// textContent is LRM-prefixed (bidi guard for the rtl left-truncating element) and
// the title is the bare path. Switching to the target side rewrites href to the
// target ref's blob. Both sides exist here, so the link is always active (no
// `differ-file-path-inactive`).
test('shows an active file-path link whose href tracks the shown side', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const link = page.locator('a.differ-file-path');
    await expect(link).toBeVisible();

    // MR side: blob URL for the source ref; active; LRM-prefixed text; bare title.
    await expect(link).toHaveAttribute('href', 'http://localhost/blob/mr-sha/diagram.bpmn');
    await expect(link).not.toHaveClass(/differ-file-path-inactive/);
    await expect(link).toHaveAttribute('title', 'diagram.bpmn');
    await expect(link).toHaveAttribute('target', '_blank');
    expect(await link.evaluate((el) => el.textContent)).toBe(LRM + 'diagram.bpmn');

    // Switch to the target/base side: href follows the target ref; still active.
    await page.getByRole('button', { name: 'Switch branch' }).click();
    await expect(link).toHaveAttribute('href', 'http://localhost/blob/base-sha/diagram.bpmn');
    await expect(link).not.toHaveClass(/differ-file-path-inactive/);
});
