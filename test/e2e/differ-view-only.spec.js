'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// BUG-0015: double-click is NOT vetoed, so bpmn-js opens its contenteditable
// label overlay (the only way to select+copy SVG label text). A capture-phase
// beforeinput veto on the canvas container blocks edits, so the text the overlay
// shows stays put when the user types.
test('canvas label opens for copy but cannot be edited (BUG-0015)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    await page.locator('svg .djs-element[data-element-id="Task_1"]').dblclick();

    const editor = page.locator('.djs-direct-editing-content');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveText('Review request');

    // Typing is vetoed → the editable overlay's text does not change.
    await editor.click();
    await page.keyboard.type('XYZ');
    await expect(editor).toHaveText('Review request');
});

// BUG-0014: the panel's text fields stay enabled (BUG-0011's pointer-events:none
// would have killed click/select/copy); a capture-phase beforeinput veto on the
// props container blocks typing/paste/delete while leaving selection + Ctrl/Cmd+C
// working. We assert the Name field is enabled and that real keystrokes don't
// change its value.
test('properties-panel field is selectable but read-only (BUG-0014)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    await expect(page.locator('.bio-properties-panel-scroll-container')).toBeVisible();
    await page.locator('svg .djs-element[data-element-id="Task_1"]').click();

    // The "General" group is collapsed by default for unchanged elements (the
    // auto-expander only opens changed/type-relevant groups). Click its header to
    // expand it so the Name input becomes visible.
    const generalHeader = page.locator('.bio-properties-panel-group-header', { hasText: 'General' });
    await expect(generalHeader).toBeVisible();
    if (!await generalHeader.evaluate((el) => el.classList.contains('open'))) {
        await generalHeader.click();
    }

    const nameInput = page.locator('#bio-properties-panel-name');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toBeEnabled();
    await expect(nameInput).toHaveValue('Review request');

    // Real keystrokes fire beforeinput → vetoed → value unchanged.
    await nameInput.click();
    await page.keyboard.type('ZZZ');
    await expect(nameInput).toHaveValue('Review request');
});

// BUG-0011: a high-priority EDIT_EVENTS listener returns false on shape.move.start,
// aborting the move before the default editing handlers create a command — so a
// real drag leaves the shape exactly where it was. Contrast: differ-edit-boot.spec.js
// "edit mode lets a shape be dragged" runs the identical drag with the veto gated off.
test('dragging a shape does not move it (BUG-0011)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const shape = page.locator('svg .djs-element[data-element-id="Task_1"]');
    const before = await shape.boundingBox();
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 120, before.y + before.height / 2 + 60, { steps: 10 });
    await page.mouse.up();

    const after = await shape.boundingBox();
    expect(after).toEqual(before);
});

// BUG-0011: the modeler's palette and context-pad are edit-only UI, hidden via CSS
// (palette also gets an inline display:none). Contrast: differ-edit-boot.spec.js
// "edit mode shows the palette and the context pad" shows both back with the same
// diagram once mode === 'edit'.
test('palette and context pad stay hidden (BUG-0011)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    // toBeHidden() also holds for an element that is not there at all, so assert
    // each one EXISTS first — otherwise a bpmn-js selector rename would turn both
    // of these guards into no-ops without a single test going red (REFAC-0014).
    const palette = page.locator('.djs-palette');
    await expect(palette).toHaveCount(1);
    await expect(palette).toBeHidden();

    await page.locator('svg .djs-element[data-element-id="Task_1"]').click();
    const contextPad = page.locator('.djs-context-pad');
    await expect(contextPad).toHaveCount(1);
    await expect(contextPad).toBeHidden();
});
