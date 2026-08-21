'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, defaultBpmnParams } = require('./support/boot-differ');

const editParams = (overrides = {}) =>
    defaultBpmnParams({ mode: 'edit', editSide: 'source', ...overrides });

const COLORING_ON = 'Colour the edits — on';
const COLORING_OFF = 'Colour the edits — off';

// Rename a task through the properties panel and wait for the debounced recompute.
async function renameTask1(page, text) {
    await page.locator('svg .djs-element[data-element-id="Task_1"]').click();
    const generalHeader = page.locator('.bio-properties-panel-group-header', { hasText: 'General' });
    await expect(generalHeader).toBeVisible();
    if (!await generalHeader.evaluate((el) => el.classList.contains('open'))) {
        await generalHeader.click();
    }
    const nameInput = page.locator('#bio-properties-panel-name');
    await nameInput.click();
    await page.keyboard.type(text);
    await nameInput.blur();
}

// An untouched diagram must show NO edit markers: the baseline is the XML as
// saveXML() returns it right after the import, so bpmn-js' own normalisation does
// not read as a change (FEAT-0031).
test('a freshly opened editor shows no edit markers', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams({ sourceRef: 'mr-sha', targetRef: 'mr-sha' }) });

    await expect(page.locator('.edit-diff-changed')).toHaveCount(0);
});

test('editing a name marks the element as changed', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams({ sourceRef: 'mr-sha', targetRef: 'mr-sha' }) });

    await renameTask1(page, 'ZZZ');

    await expect(page.locator('svg .djs-element[data-element-id="Task_1"]'))
        .toHaveClass(/edit-diff-changed/, { timeout: 5000 });
});

test('the toggle clears and restores the edit colouring', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams({ sourceRef: 'mr-sha', targetRef: 'mr-sha' }) });

    await renameTask1(page, 'ZZZ');
    const task = page.locator('svg .djs-element[data-element-id="Task_1"]');
    await expect(task).toHaveClass(/edit-diff-changed/, { timeout: 5000 });

    await page.getByTitle(COLORING_ON).click();
    await expect(task).not.toHaveClass(/edit-diff-changed/);

    await page.getByTitle(COLORING_OFF).click();
    await expect(task).toHaveClass(/edit-diff-changed/);
});

// Opened from an MR diff, the editor also carries colour layer 3: the element the
// MR added is coloured before the user does anything.
test('the MR diff is painted as markers, not through setColor', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]'))
        .toHaveClass(/edit-diff-added/, { timeout: 5000 });

    // setColor would have pushed a command, so an untouched editor must be clean:
    // no beforeunload warning and nothing to undo.
    const canUndo = await page.evaluate(() => window.__bpmnDifferModeler
        ? window.__bpmnDifferModeler.get('commandStack').canUndo() : null);
    expect(canUndo).toBe(false);
});
