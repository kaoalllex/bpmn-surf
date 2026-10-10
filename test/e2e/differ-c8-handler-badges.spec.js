'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams,
    C8_DELIVERY_BASE_BPMN, C8_PAYMENT_BASE_BPMN, C8_ORDER_MAIN_BASE_BPMN
} = require('./support/boot-differ');

// Camunda 8 handler badges: the key is the zeebe:TaskDefinition job type, the
// worker is a @JobWorker method (with a type, or named after it).
const same = (xml) => ({ 'mr-sha': xml, 'base-sha': xml });
const element = (page, id) => page.locator(`svg .djs-element[data-element-id="${id}"]`);
const badgeOn = (page, id) =>
    page.locator(`.djs-overlays[data-container-id="${id}"] .handler-link`);

test('a C8 service task gets the neutral badge on selection', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { fixtures: { xmlByRef: same(C8_DELIVERY_BASE_BPMN) } });

    await element(page, 'FindItems').click();
    await expect(badgeOn(page, 'FindItems')).toBeVisible();
    await expect(badgeOn(page, 'FindItems')).toHaveAttribute('title', 'Open the handler code');
});

test('a changed worker marks its task, not the longer-named one', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ changeRequestId: 19 }),
        fixtures: {
            xmlByRef: same(C8_DELIVERY_BASE_BPMN),
            changedFiles: [{ path: 'src/main/kotlin/FindItemsWorker.kt', status: 'changed' }],
            contentByRefPath: {
                'mr-sha:src/main/kotlin/FindItemsWorker.kt':
                    '@Component\nclass FindItemsWorker {\n    @JobWorker(type = "find-items")\n    fun findItems() {}\n}'
            }
        }
    });

    await expect(page.locator('.djs-overlays[data-container-id="FindItems"] .handler-link-changed')).toBeVisible();
    await expect(page.locator('.handler-link-changed')).toHaveCount(1);
});

test('a worker named after its method marks its task', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ changeRequestId: 19 }),
        fixtures: {
            xmlByRef: same(C8_ORDER_MAIN_BASE_BPMN),
            changedFiles: [{ path: 'src/main/kotlin/ScreenFraudWorker.kt', status: 'changed' }],
            contentByRefPath: {
                'mr-sha:src/main/kotlin/ScreenFraudWorker.kt':
                    'class ScreenFraudWorker {\n    @JobWorker\n    fun screenFraud(@Variable orderId: String) = 1\n}'
            }
        }
    });

    await expect(page.locator('.djs-overlays[data-container-id="ScreenFraud"] .handler-link-changed')).toBeVisible();
});

test('a Camunda connector task gets no badge', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { fixtures: { xmlByRef: same(C8_PAYMENT_BASE_BPMN) } });

    // A job worker task first, so the absence below is not just a slow overlay.
    await element(page, 'ChargeCustomer').click();
    await expect(badgeOn(page, 'ChargeCustomer')).toBeVisible();

    await element(page, 'NotifyProvider').click();
    await expect(page.locator('.djs-overlays[data-container-id="ChargeCustomer"] .handler-link')).toHaveCount(0);
    await expect(badgeOn(page, 'NotifyProvider')).toHaveCount(0);
});
