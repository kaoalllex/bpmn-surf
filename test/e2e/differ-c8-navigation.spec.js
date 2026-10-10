'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, bootDmnDiffer, wireDiagnostics, defaultBpmnParams, defaultDmnParams,
    C8_ORDER_MAIN_BASE_BPMN, C8_PAYMENT_BASE_BPMN, C8_DELIVERY_BASE_BPMN, C8_PAYMENT_RISK_DMN
} = require('./support/boot-differ');
const { installTabCapture, getOpenDifferCalls, getOpenUrlCalls } = require('./support/dive-in-capture');
const { installCapture } = require('./support/dive-out-capture');

// Camunda 8 navigation: the called ids live in zeebe:calledElement /
// zeebe:calledDecision, and the reverse search keys on processId= / decisionId=.
const same = (xml) => ({ 'mr-sha': xml, 'base-sha': xml });
const element = (page, id) => page.locator(`svg .djs-element[data-element-id="${id}"]`);
const diveInBadge = (page) => page.locator('.djs-overlay-note .dive-in-call-activity');
const searchTerms = (page) => page.evaluate(() => window.__platformClient.searchCalls.map((call) => call.term));

test('dives into the process a C8 call activity calls', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: {
            xmlByRef: same(C8_ORDER_MAIN_BASE_BPMN),
            searchHits: [{ path: 'bpmn/order/payment/Payment.bpmn', line: 4, snippet: '<bpmn:process id="PaymentC8" name="Payment">' }]
        }
    });
    await installTabCapture(page);

    await element(page, 'Payment').click();
    await diveInBadge(page).click();

    await expect.poll(async () => (await getOpenDifferCalls(page)).length).toBe(1);
    expect((await getOpenDifferCalls(page))[0].params.filePath).toBe('bpmn/order/payment/Payment.bpmn');
});

test('dives into the decision a C8 business rule task calls', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: {
            xmlByRef: same(C8_PAYMENT_BASE_BPMN),
            searchHits: [{ path: 'dmn/payment/PaymentRiskC8.dmn', line: 9, snippet: '<decision id="PaymentRiskC8" name="Payment risk">' }]
        }
    });
    await installTabCapture(page);
    const dmnMsgId = await page.evaluate(() => DmnDiffer.MSG_ID);

    await element(page, 'AssessRisk').click();
    await expect(diveInBadge(page)).toHaveAttribute('title', 'Open the called decision');
    await diveInBadge(page).click();

    await expect.poll(async () => (await getOpenDifferCalls(page)).length).toBe(1);
    const [call] = await getOpenDifferCalls(page);
    expect(call.params.filePath).toBe('dmn/payment/PaymentRiskC8.dmn');
    expect(call.msgId).toBe(dmnMsgId);
});

test('opens the code-search page for a process defined nowhere', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { fixtures: { xmlByRef: same(C8_PAYMENT_BASE_BPMN), searchHits: [] } });
    await installTabCapture(page);

    await element(page, 'Dunning').click();
    await diveInBadge(page).click();

    await expect.poll(async () => (await getOpenUrlCalls(page)).length).toBe(1);
    expect(await getOpenUrlCalls(page)).toEqual(['http://localhost/search?term=DunningC8']);
});

test('goes straight to the code-search page for a FEEL process id', async ({ page }) => {
    wireDiagnostics(page);
    const feelId = C8_PAYMENT_BASE_BPMN.replace('processId="DunningC8"', 'processId="=dunningProcess"');
    await bootBpmnDiffer(page, { fixtures: { xmlByRef: same(feelId), searchHits: [] } });
    await installTabCapture(page);

    await element(page, 'Dunning').click();
    await diveInBadge(page).click();

    await expect.poll(async () => (await getOpenUrlCalls(page)).length).toBe(1);
    expect(await getOpenUrlCalls(page)).toEqual(['http://localhost/search?term=%3DdunningProcess']);
    expect(await searchTerms(page)).toEqual([]);
});

test('the dive-out menu of a C8 diagram searches processId=', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ filePath: 'bpmn/order/fulfillment/Delivery.bpmn', fileName: 'Delivery.bpmn' }),
        fixtures: {
            xmlByRef: same(C8_DELIVERY_BASE_BPMN),
            searchHits: [{ path: 'bpmn/order/fulfillment/Fulfillment.bpmn', line: 1, snippet: '<zeebe:calledElement processId="DeliveryC8"' }]
        }
    });
    await installCapture(page);

    await page.locator('.differ-back-caret').click();
    await expect(page.locator('.differ-back-menu-item .differ-back-menu-name')).toHaveText('Fulfillment.bpmn');
    expect(await searchTerms(page)).toEqual(['processId="DeliveryC8"']);
});

test('the dive-out menu of a C8 DMN searches decisionId=', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams({ filePath: 'dmn/payment/PaymentRiskC8.dmn', fileName: 'PaymentRiskC8.dmn' }),
        fixtures: {
            xmlByRef: same(C8_PAYMENT_RISK_DMN),
            searchHits: [{ path: 'bpmn/order/payment/Payment.bpmn', line: 1, snippet: '<zeebe:calledDecision decisionId="PaymentRiskC8"' }]
        }
    });
    await installCapture(page);

    await page.locator('.differ-back-caret').click();
    await expect(page.locator('.differ-back-menu-item .differ-back-menu-name')).toHaveText('Payment.bpmn');
    expect(await searchTerms(page)).toEqual(['decisionId="PaymentRiskC8"']);
});

test('auto-selects the C8 business rule task that calls the decision we came from', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ selectCalledProcessIds: ['PaymentRiskC8'] }),
        fixtures: { xmlByRef: same(C8_PAYMENT_BASE_BPMN) }
    });

    await expect(page.locator('svg .djs-element.selected[data-element-id="AssessRisk"]')).toBeVisible();
    await expect(page.locator('.bio-properties-panel-group-header-title', { hasText: /^Called decision$/ }))
        .toHaveCount(1);
});

test('shows the correlation badge on a C8 receive task', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { fixtures: { xmlByRef: same(C8_ORDER_MAIN_BASE_BPMN) } });

    await element(page, 'AwaitPayment').click();

    await expect(page.locator('.djs-overlay-note .correlation-link')).toBeVisible();
});
