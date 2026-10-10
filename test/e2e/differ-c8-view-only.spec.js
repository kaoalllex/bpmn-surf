'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, C8_ORDER_MAIN_BASE_BPMN } = require('./support/boot-differ');

// The Zeebe panel shows every FEEL value (mapping sources, scripts, collections)
// in a CodeMirror editor, a contenteditable. In view mode it must stay selectable
// and copyable like a plain field (BUG-0014), yet no keystroke, paste, cut or drop
// may change it — CodeMirror edits from its own keydown/paste handlers, which a
// beforeinput veto alone does not reach.
test('a FEEL field of the Zeebe panel is selectable but read-only', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: { xmlByRef: { 'base-sha': C8_ORDER_MAIN_BASE_BPMN, 'mr-sha': C8_ORDER_MAIN_BASE_BPMN } }
    });

    await page.locator('svg .djs-element[data-element-id="ValidateOrder"]').click();
    const entry = page.locator('.bio-properties-panel-collapsible-entry-header', {
        has: page.getByText('orderId', { exact: true })
    });
    await entry.click();
    const source = page.locator('[id="bio-properties-panel-ValidateOrder-input-0-source"]');
    await expect(source).toHaveCount(1);
    await expect(source).toHaveText('orderId');

    // Selectable: a triple click selects the expression.
    await source.click({ clickCount: 3 });
    await expect.poll(() => page.evaluate(() => window.getSelection().toString())).toContain('orderId');

    // Read-only: typing, deleting, a new line, a cut and a paste leave it as it was.
    await page.evaluate(() => navigator.clipboard.writeText('PASTED'));
    await source.click();
    await page.keyboard.type('ZZZ');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+x');
    await page.keyboard.press('ControlOrMeta+v');
    await page.waitForTimeout(500);
    await expect(source).toHaveText('orderId');
});
