'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams,
    CALL_ACTIVITY_IN_BASE_BPMN, CALL_ACTIVITY_IN_CHANGED_BPMN
} = require('./support/boot-differ');

// CallActivity_1's In mappings differ on the MR side: varIn changed (source), newVar
// added, itemId unchanged, oldVar removed (base-only). Selecting it paints the "In
// mappings" group header blue (#8888ff), auto-expands it (Axis A) so its list items
// render, then colours the changed item blue and the added item green (#88ff88, MR side).
// Switching to the base side re-runs the highlighter: oldVar is base-only → removed →
// painted red (#ff8888). The real panel renders an item title as <code>target</code>, so
// its target text identifies the entry header.
test('highlights the changed group header and its list items by direction', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'base-sha': CALL_ACTIVITY_IN_BASE_BPMN, 'mr-sha': CALL_ACTIVITY_IN_CHANGED_BPMN } }
    });

    await expect(page.locator('.bio-properties-panel-scroll-container')).toBeVisible();
    await page.locator('svg .djs-element[data-element-id="CallActivity_1"]').click();

    // The changed group header is painted blue. Locate by header text — the live panel
    // sets no `title` attribute on group-header titles (production matches by
    // textContent); the header contains only the title ("In mappings"), while the list
    // entries live in a sibling .bio-properties-panel-list, so hasText is unambiguous.
    const groupHeader = page.locator('.bio-properties-panel-group-header', { hasText: 'In mappings' });
    await expect(groupHeader).toHaveCSS('background-color', 'rgb(136, 136, 255)');

    // The changed mapping (varIn) → blue; the added mapping (newVar) → green.
    const changedItem = page.locator('.bio-properties-panel-collapsible-entry-header', {
        has: page.getByText('varIn', { exact: true })
    });
    await expect(changedItem).toHaveCSS('background-color', 'rgb(136, 136, 255)');

    const addedItem = page.locator('.bio-properties-panel-collapsible-entry-header', {
        has: page.getByText('newVar', { exact: true })
    });
    await expect(addedItem).toHaveCSS('background-color', 'rgb(136, 255, 136)');

    // Removed direction (inversion): switch to the base side. CallActivity_1 stays
    // selected and the group stays open, so the highlighter re-runs for the base-side
    // diff. oldVar exists only in the base version (the MR removed it) → it is the
    // removed mapping, painted RED (#ff8888 → rgb(255,136,136)) because the target side
    // is shown — the colour the MR side cannot show. newVar is absent here.
    await page.getByRole('button', { name: 'Switch branch' }).click();
    const removedItem = page.locator('.bio-properties-panel-collapsible-entry-header', {
        has: page.getByText('oldVar', { exact: true })
    });
    await expect(removedItem).toHaveCSS('background-color', 'rgb(255, 136, 136)');
});
