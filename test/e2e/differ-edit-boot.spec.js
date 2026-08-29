'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, defaultBpmnParams } = require('./support/boot-differ');

const editParams = (overrides = {}) =>
    defaultBpmnParams({ mode: 'edit', editSide: 'source', ...overrides });

// FEAT-0031: in edit mode the four BUG-0011/0014/0015 mutes are lifted, so the
// modeler's own editing UI is back.
test('edit mode shows the palette and the context pad', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    await expect(page.locator('.djs-palette')).toBeVisible();

    await page.locator('svg .djs-element[data-element-id="Task_1"]').click();
    await expect(page.locator('.djs-context-pad')).toBeVisible();
});

// The EDIT_EVENTS veto is gated by the mode, so a drag really moves the shape.
test('edit mode lets a shape be dragged', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    const shape = page.locator('svg .djs-element[data-element-id="Task_1"]');
    const before = await shape.boundingBox();
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 120, before.y + before.height / 2 + 60, { steps: 10 });
    await page.mouse.up();

    const after = await shape.boundingBox();
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(50);
});

// The properties-panel beforeinput veto is gated too, so the Name field accepts text.
test('edit mode lets the properties panel be typed into', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    await expect(page.locator('.bio-properties-panel-scroll-container')).toBeVisible();
    await page.locator('svg .djs-element[data-element-id="Task_1"]').click();

    const generalHeader = page.locator('.bio-properties-panel-group-header', { hasText: 'General' });
    await expect(generalHeader).toBeVisible();
    if (!await generalHeader.evaluate((el) => el.classList.contains('open'))) {
        await generalHeader.click();
    }

    const nameInput = page.locator('#bio-properties-panel-name');
    await expect(nameInput).toHaveValue('Review request');
    await nameInput.click();
    await page.keyboard.type('ZZZ');
    await expect(nameInput).toHaveValue('Review requestZZZ');
});

// The changes table belongs to review, not to an editor (FEAT-0031).
test('edit mode renders no changes table and no Switch branch', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    await expect(page.locator('.changes-table')).toHaveCount(0);
    await expect(page.getByText('Switch branch')).toHaveCount(0);
});

// View mode offers the entry point; edit mode does not offer it again.
test('the edit button is present in view mode and absent in edit mode', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);
    await expect(page.getByTitle('Edit this diagram in a new tab')).toBeVisible();

    await bootBpmnDiffer(page, { params: editParams() });
    await expect(page.getByTitle('Edit this diagram in a new tab')).toHaveCount(0);
});

// No test on the branch exercised undo/redo at all — the toolbar buttons (↶/↷)
// are the contract that matters (Ctrl+Z is skipped: focus handling in headless
// makes it flaky and it is not the toolbar contract).
test('undo (↶) reverts a drag and redo (↷) reapplies it', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    const shape = page.locator('svg .djs-element[data-element-id="Task_1"]');
    const before = await shape.boundingBox();
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 120, before.y + before.height / 2 + 60, { steps: 10 });
    await page.mouse.up();

    const afterDrag = await shape.boundingBox();
    expect(Math.abs(afterDrag.x - before.x)).toBeGreaterThan(50);

    await page.getByTitle('Undo (Ctrl+Z)').click();
    const afterUndo = await shape.boundingBox();
    expect(Math.abs(afterUndo.x - before.x)).toBeLessThan(5);

    await page.getByTitle('Redo (Ctrl+Y)').click();
    const afterRedo = await shape.boundingBox();
    expect(Math.abs(afterRedo.x - before.x)).toBeGreaterThan(50);
});

// FEAT-0031: the pair mirrors the command stack, so it is honest about what a
// click will do and doubles as the "there is unsaved work" signal.
test('undo/redo follow the command stack', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    const undo = page.getByTitle('Undo (Ctrl+Z)');
    const redo = page.getByTitle('Redo (Ctrl+Y)');
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();

    const shape = page.locator('svg .djs-element[data-element-id="Task_1"]');
    const before = await shape.boundingBox();
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 120, before.y + before.height / 2 + 60, { steps: 10 });
    await page.mouse.up();

    await expect(undo).toBeEnabled();
    await expect(redo).toBeDisabled();

    await undo.click();
    await expect(undo).toBeDisabled();
    await expect(redo).toBeEnabled();
});

// A swatch colours the SELECTION, so with nothing selected it would swallow the
// click silently (FEAT-0031).
test('the colour swatches are disabled until something is selected', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    const swatches = page.locator('.edit-color-swatch');
    await expect(swatches).toHaveCount(6);
    await expect(page.locator('.edit-color-swatch:disabled')).toHaveCount(6);

    await page.locator('svg .djs-element[data-element-id="Task_1"]').click();
    await expect(page.locator('.edit-color-swatch:disabled')).toHaveCount(0);

    // Clicking the empty canvas clears the selection, and the swatches follow.
    await page.locator('svg[data-element-id="Process_1"]').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('.edit-color-swatch:disabled')).toHaveCount(6);
});

// FEAT-0031: the colour swatches are also on the context pad, where anyone coming
// from Camunda Modeler looks for them. A colour set there goes into the MODEL.
test('the context pad colours the element it belongs to', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    await page.locator('svg .djs-element[data-element-id="Task_1"]').click();
    await page.locator('.djs-context-pad .entry.edit-color-pad-entry').click();

    const popup = page.locator('.edit-color-popup');
    await expect(popup.locator('.edit-color-swatch')).toHaveCount(6);
    await popup.getByTitle('Colour the selection blue').click();

    // Choosing a colour closes the popup and repaints the element from the model.
    await expect(popup).toHaveCount(0);
    const rect = page.locator('svg .djs-element[data-element-id="Task_1"] .djs-visual > :first-child');
    await expect(rect).toHaveCSS('fill', 'rgb(187, 222, 251)');
    await expect(rect).toHaveCSS('stroke', 'rgb(13, 67, 114)');
});

// The popup is a plain DOM layer over the canvas, so it needs its own dismissal.
test('the context pad colour popup closes on Escape', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    await page.locator('svg .djs-element[data-element-id="Task_1"]').click();
    await page.locator('.djs-context-pad .entry.edit-color-pad-entry').click();
    await expect(page.locator('.edit-color-popup')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(page.locator('.edit-color-popup')).toHaveCount(0);
});

// onUndo/onRedo call commandStack.undo()/.redo() directly rather than
// editorActions.trigger('undo'/'redo'), which would tear down an open direct-edit
// overlay first. Probing the risky case directly: make an undoable change, THEN
// open the canvas label editor (double-click — not vetoed in edit mode, BUG-0015)
// and leave it open, then undo. If the direct call misbehaves it should surface as
// a page error or a stuck editor that blocks further interaction.
test('undo while a label editor is still open does not misbehave', async ({ page }) => {
    wireDiagnostics(page);
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await bootBpmnDiffer(page, { params: editParams() });

    const shape = page.locator('svg .djs-element[data-element-id="Task_1"]');
    const before = await shape.boundingBox();
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 100, before.y + before.height / 2 + 50, { steps: 10 });
    await page.mouse.up();

    await shape.dblclick();
    await expect(page.locator('.djs-direct-editing-content')).toBeVisible();

    await page.getByTitle('Undo (Ctrl+Z)').click();

    expect(errors).toEqual([]);
    const afterUndo = await shape.boundingBox();
    expect(Math.abs(afterUndo.x - before.x)).toBeLessThan(5);

    // The page must stay interactive afterwards (nothing left stuck).
    await page.locator('svg .djs-element[data-element-id="Task_2"]').click();
    await expect(page.locator('.bio-properties-panel-scroll-container')).toBeVisible();
});

// View mode replaces the native condition field with a read-only formatted block
// (PropertiesPanelHighlighter#showConditionExpression). In edit mode that block would
// hide the only control the user can change the condition in.
test('edit mode keeps the sequence flow condition editable', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams({ sourceRef: 'mr-sha', targetRef: 'mr-sha' }) });

    await expect(page.locator('.bio-properties-panel-scroll-container')).toBeVisible();
    await page.locator('svg .djs-element[data-element-id="Flow_2"] .djs-hit').click({ force: true });

    const conditionHeader = page.locator('.bio-properties-panel-group-header', { hasText: 'Condition' });
    await expect(conditionHeader).toBeVisible();
    if (!await conditionHeader.evaluate((el) => el.classList.contains('open'))) {
        await conditionHeader.click();
    }

    await expect(page.locator('div.properties-condition')).toHaveCount(0);
    const input = page.locator('#bio-properties-panel-conditionExpression');
    await expect(input).toBeVisible();

    // A trailing space would be normalised away by the comparator, so type a real token.
    await input.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' && ok');
    await input.blur();

    await expect(page.locator('svg .djs-element[data-element-id="Flow_2"]'))
        .toHaveClass(/edit-diff-changed/, { timeout: 5000 });
});

// Drag Task_1 aside. A real pointer gesture, not modeling.updateProperties via the
// test seam: Chromium suppresses the beforeunload prompt on a frame that never had a
// user gesture, so the interaction is part of what the guard needs.
async function dragTask1(page) {
    const shape = page.locator('svg .djs-element[data-element-id="Task_1"]');
    const box = await shape.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 10 });
    await page.mouse.up();
    await expect(page.getByTitle('Undo (Ctrl+Z)')).toBeEnabled();
}

// FEAT-0031: an editor tab holds the only copy of the work — nothing is written back
// to the repository — so closing it with edits pending must ask first. The guard runs
// through EditSession#isDirty, unlike the undo/redo buttons, which read the command
// stack directly (REFAC-0015 §7).
test('closing an editor with unsaved edits asks for confirmation', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });
    await dragTask1(page);

    const dialogPromise = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });

    const dialog = await dialogPromise;
    expect(dialog.type()).toBe('beforeunload');
    await dialog.dismiss();
});

// The control: without it the test above would also pass against a guard that warns
// unconditionally, which would nag on every close of an untouched editor.
test('closing an untouched editor asks nothing', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    // A gesture, so the prompt is not suppressed for want of one — but a selection is
    // not a command, so the session stays clean.
    await page.locator('svg .djs-element[data-element-id="Task_1"]').click();
    await expect(page.getByTitle('Undo (Ctrl+Z)')).toBeDisabled();

    const dialogs = [];
    page.on('dialog', (dialog) => { dialogs.push(dialog); dialog.dismiss(); });
    await page.close({ runBeforeUnload: true });
    await page.waitForEvent('close');

    expect(dialogs).toEqual([]);
});
