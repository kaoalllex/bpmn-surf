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
