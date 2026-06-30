'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, MESSAGE_CORRELATION_BPMN
} = require('./support/boot-differ');

const FIXTURES = { xmlByRef: { 'mr-sha': MESSAGE_CORRELATION_BPMN, 'base-sha': MESSAGE_CORRELATION_BPMN } };

async function clickBadge(page, elementId) {
    await page.locator(`svg .djs-element[data-element-id="${elementId}"]`).click();
    await page.locator('.djs-overlay-note .correlation-link').click();
}

// A ${…} message name cannot be searched literally → an explanatory note.
test('explains that a dynamic message name cannot be searched', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: defaultBpmnParams(), fixtures: FIXTURES });

    await clickBadge(page, 'MessageCatch_Dyn');

    const menu = page.locator('.correlation-menu');
    await expect(menu).toBeVisible();
    await expect(menu.locator('.differ-back-menu-message')).toHaveText(
        'This message name is built at runtime (${…}) — cannot search for a literal.'
    );
});

// All matches are in test files → honest "only in tests" note, nothing listed.
test('reports when references are found only in tests', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: {
            ...FIXTURES,
            searchHits: [{ path: 'src/test/OrderListenerTest.kt', line: 8, snippet: 'correlateMessage("OrderPlaced")' }]
        }
    });

    await clickBadge(page, 'ReceiveTask_1');

    await expect(page.locator('.correlation-menu .differ-back-menu-message')).toHaveText(
        'Found references only in tests — hidden.'
    );
});

// BUG-0013: a hit whose snippet does NOT contain the literal message name (an
// Elasticsearch sub-token match) is filtered out → nothing usable remains.
test('filters out sub-token hits whose snippet lacks the literal (BUG-0013)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: {
            ...FIXTURES,
            searchHits: [{ path: 'src/UnrelatedHandler.kt', line: 3, snippet: 'correlateMessage(SCREEN_CHANGED)' }]
        }
    });

    await clickBadge(page, 'ReceiveTask_1');

    await expect(page.locator('.correlation-menu .differ-back-menu-message')).toHaveText(
        'Could not pinpoint a correlation point.'
    );
});
