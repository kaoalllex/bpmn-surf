'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, BASE_BPMN, CHANGED_FLOW_CONDITION_BPMN
} = require('./support/boot-differ');

// Flow_2's condition differs between the sides (true ⇄ false) and its source is a task
// (not a gateway), so selecting it auto-expands "Condition" via Axis A only (the diff
// recorded that group). The injected div.properties-condition colours the line unique to
// the shown side: GREEN (added) on the MR side, RED (removed) after Switch — the
// direction inversion. Selection persists across Switch (the differ re-selects it).
test('auto-expands the changed Condition group and inverts the condition colour on switch', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: { xmlByRef: { 'base-sha': BASE_BPMN, 'mr-sha': CHANGED_FLOW_CONDITION_BPMN } }
    });

    await expect(page.locator('.bio-properties-panel-scroll-container')).toBeVisible();

    // Select the conditional flow (connection clicks route through the invisible hit zone).
    await page.locator('svg .djs-element[data-element-id="Flow_2"] .djs-hit').click({ force: true });

    // Axis A: the changed "Condition" group auto-expands. Locate by header text — the
    // live panel sets no `title` attribute on group-header titles (production matches by
    // textContent); pattern matches the shipped differ-view-only.spec.js.
    const conditionHeader = page.locator('.bio-properties-panel-group-header', { hasText: 'Condition' });
    await expect(conditionHeader).toHaveClass(/(^|\s)open(\s|$)/);

    // MR side: the line unique to this side ("approved == false") is painted green (add).
    const condition = page.locator('div.properties-condition');
    await expect(condition).toBeAttached();
    const mrLine = condition.locator('div', { hasText: 'approved' });
    await expect(mrLine).toHaveCSS('background-color', 'rgb(136, 255, 136)');

    // Switch to the base side: the differ re-selects Flow_2 and redraws the condition;
    // now "approved == true" is the line unique to the shown side → painted red (remove).
    await page.getByRole('button', { name: 'Switch branch' }).click();
    const baseLine = page.locator('div.properties-condition div', { hasText: 'approved' });
    await expect(baseLine).toHaveCSS('background-color', 'rgb(255, 136, 136)');
});
