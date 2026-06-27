'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

test('boots the BPMN differ and renders the diagram', async ({ page }) => {
    wireDiagnostics(page);

    await bootBpmnDiffer(page);

    // Toolbar with the primary action rendered.
    await expect(page.locator('.differ-toolbar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch branch' })).toBeVisible();

    // bpmn-js actually rendered the diagram into the canvas cell.
    const canvas = page.locator('#bpmnCanvas_12345bf3d4e842caa0d88194431197c0');
    await expect(canvas).toBeVisible();
    await expect(canvas.locator('svg .djs-element').first()).toBeVisible();
});
