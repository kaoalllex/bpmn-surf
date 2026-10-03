'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, bootDmnDiffer, wireDiagnostics, defaultBpmnParams, defaultDmnParams,
    BASE_BPMN, ADDED_TASK_BPMN, BASE_DMN, ADDED_RULE_DMN
} = require('./support/boot-differ');

const CANVAS = '#bpmnCanvas_12345bf3d4e842caa0d88194431197c0';
const FAILURE = 'Could not load the file. Reload the tab to try again.';

// The target side is fetched over http so the request can be dropped; `fails`
// is how many attempts in a row are aborted before one is answered.
async function dropRawRequests(page, body, fails) {
    const calls = { count: 0 };
    await page.route('**/fake-raw/**', (route) => {
        calls.count++;
        return calls.count <= fails ? route.abort('failed') : route.fulfill({ body });
    });
    return calls;
}

test('a dropped diagram request is retried once', async ({ page }) => {
    wireDiagnostics(page);
    const calls = await dropRawRequests(page, BASE_BPMN, 1);
    await bootBpmnDiffer(page, {
        fixtures: { xmlByRef: { 'mr-sha': ADDED_TASK_BPMN }, httpRefs: ['base-sha'] }
    });

    await expect(page.locator(`${CANVAS} svg .djs-element`).first()).toBeVisible();
    expect(calls.count).toBe(2);
});

test('a diagram that cannot be loaded says so instead of spinning', async ({ page }) => {
    wireDiagnostics(page);
    const calls = await dropRawRequests(page, BASE_BPMN, 2);
    await bootBpmnDiffer(page, {
        fixtures: { xmlByRef: { 'mr-sha': ADDED_TASK_BPMN }, httpRefs: ['base-sha'] }
    });

    await expect(page.locator('.differ-empty-state-message')).toHaveText(FAILURE);
    await expect(page.locator('.differ-loading-overlay')).toBeHidden();
    expect(calls.count).toBe(2);
});

test('a decision that cannot be loaded says so instead of spinning', async ({ page }) => {
    wireDiagnostics(page);
    await dropRawRequests(page, BASE_DMN, 2);
    await bootDmnDiffer(page, {
        params: defaultDmnParams(),
        fixtures: { xmlByRef: { 'mr-sha': ADDED_RULE_DMN }, httpRefs: ['base-sha'] }
    });

    await expect(page.locator('.differ-empty-state-message')).toHaveText(FAILURE);
    await expect(page.locator('.differ-loading-overlay')).toBeHidden();
});
