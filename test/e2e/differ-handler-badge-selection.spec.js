'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, HANDLER_BADGES_BPMN
} = require('./support/boot-differ');

// Without a changeRequestId no permanent (changed) badges are computed, so a
// service task with a recognised handler shows the neutral on-selection badge:
// class exactly "handler-link" (no colour suffix), title "Open the handler code".
test('shows the neutral handler badge on a selected service task', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),   // no changeRequestId → no changed handlers
        fixtures: { xmlByRef: { 'mr-sha': HANDLER_BADGES_BPMN, 'base-sha': HANDLER_BADGES_BPMN } }
    });

    await page.locator('svg .djs-element[data-element-id="ClassTask"]').click();

    const badge = page.locator('.djs-overlay-note .handler-link');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', 'Open the handler code');
    await expect(badge).not.toHaveClass(/handler-link-(added|changed|removed)/);
});

// FEAT-0018: a message end event whose nested MessageEventDefinition carries a
// handler (camunda:class) also gets the neutral badge on selection.
test('shows the neutral handler badge on a message end event (FEAT-0018)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': HANDLER_BADGES_BPMN, 'base-sha': HANDLER_BADGES_BPMN } }
    });

    await page.locator('svg .djs-element[data-element-id="NotifyEnd"]').click();

    const badge = page.locator('.djs-overlay-note .handler-link');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', 'Open the handler code');
});
