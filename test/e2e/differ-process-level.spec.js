'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams,
    C7_PAYMENT_BASE_BPMN, C7_ORDER_MAIN_BASE_BPMN, C8_ORDER_MAIN_BASE_BPMN, C8_ORDER_MAIN_CHANGED_BPMN,
    C7_FULFILLMENT_BASE_BPMN, C7_FULFILLMENT_CHANGED_BPMN, C8_FULFILLMENT_BASE_BPMN
} = require('./support/boot-differ');

// BUG-0050: a change to the process element itself. A pool shows its process's groups,
// so the change is painted there; a pool-less process is the canvas root — the panel
// shows it with nothing selected, and the changes table lists it.
const CHANGED = 'rgb(136, 136, 255)';

const groupHeader = (page, name) => page.locator('.bio-properties-panel-group-header').filter({
    has: page.locator('.bio-properties-panel-group-header-title', { hasText: new RegExp(`^${name}$`) })
});
const element = (page, id) => page.locator(`svg .djs-element[data-element-id="${id}"]`);

function replaceOnce(xml, oldString, newString) {
    if (xml.split(oldString).length !== 2) {
        throw new Error(`the fixture must contain the anchor exactly once: ${oldString}`);
    }
    return xml.replace(oldString, newString);
}

async function boot(page, base, changed) {
    const warnings = [];
    page.on('console', (msg) => {
        if (msg.type() === 'warning') warnings.push(msg.text());
    });
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { fixtures: { xmlByRef: { 'base-sha': base, 'mr-sha': changed } } });
    return warnings;
}

const unmapped = (warnings) => warnings.filter((text) => text.includes('property group not found for diff'));

test('a pool-less process: the root panel and a changes-table row', async ({ page }) => {
    const processOpen = '<bpmn:process id="PaymentProcess" name="Payment" isExecutable="true">';
    const changed = replaceOnce(C7_PAYMENT_BASE_BPMN, processOpen,
        '<bpmn:process id="PaymentProcess" name="Payment" isExecutable="true" camunda:historyTimeToLive="180">'
        + '<bpmn:extensionElements><camunda:executionListener class="a.Audit" event="start" /></bpmn:extensionElements>');
    const warnings = await boot(page, C7_PAYMENT_BASE_BPMN, changed);

    // Nothing is selected on boot, so the panel shows the process
    await expect(groupHeader(page, 'History cleanup')).toHaveCSS('background-color', CHANGED);
    await expect(groupHeader(page, 'Execution listeners')).toHaveCSS('background-color', CHANGED);

    await expect(page.locator('td:has-text("Changed:") + td')).toHaveText('1');
    await page.getByRole('button', { name: 'Show changes' }).click();
    const row = page.locator('table.changes-table tbody tr', { hasText: 'PaymentProcess' });
    await expect(row.locator('.changes-table-badge')).toHaveAttribute('title', 'changed');
    await expect(row.locator('.changes-table-type')).toHaveAttribute('title', 'Process');
    await expect(row.locator('td').nth(2)).toHaveText('History cleanup, Execution listeners');

    // Away to a task and back to the process through its row
    await element(page, 'AssessRisk').click({ force: true });
    await expect(groupHeader(page, 'History cleanup')).toHaveCount(0);
    await row.click();
    await expect(groupHeader(page, 'History cleanup')).toHaveCSS('background-color', CHANGED);
    await expect(page.locator('.djs-element.highlight-diff-big')).toHaveCount(0);

    // The other side of the MR: the re-import keeps the root panel painted
    await page.getByRole('button', { name: /Switch/ }).click();
    await expect(groupHeader(page, 'History cleanup')).toHaveCSS('background-color', CHANGED);

    expect(unmapped(warnings)).toEqual([]);
});

test('a pool: the process changes and its own name are painted on the pool', async ({ page }) => {
    const changed = replaceOnce(
        replaceOnce(C7_ORDER_MAIN_BASE_BPMN, 'name="Order origination" processRef="OrderMainProcess"',
            'name="Order intake" processRef="OrderMainProcess"'),
        '<bpmn:process id="OrderMainProcess" ', '<bpmn:process id="OrderMainProcess" camunda:candidateStarterGroups="sales" ');
    const warnings = await boot(page, C7_ORDER_MAIN_BASE_BPMN, changed);

    await element(page, 'OrderMainProcess_pool').click({ force: true });
    await expect(groupHeader(page, 'General')).toHaveCSS('background-color', CHANGED);
    await expect(groupHeader(page, 'Candidate starter')).toHaveCSS('background-color', CHANGED);

    await page.getByRole('button', { name: 'Show changes' }).click();
    const row = page.locator('table.changes-table tbody tr', { hasText: 'OrderMainProcess_pool' });
    await expect(row.locator('td').nth(2)).toHaveText('General, Candidate starter');

    expect(unmapped(warnings)).toEqual([]);
});

test('Camunda 8: a changed version tag is painted on the pool', async ({ page }) => {
    const warnings = await boot(page, C8_ORDER_MAIN_BASE_BPMN, C8_ORDER_MAIN_CHANGED_BPMN);

    // The pool takes a thick border, not the fill: the changed tasks inside must stay visible.
    const poolRect = element(page, 'Participant_Order').locator('.djs-visual > rect').first();
    await expect(poolRect).toHaveCSS('stroke', 'rgb(0, 0, 170)');
    await expect(poolRect).toHaveCSS('stroke-width', '4px');
    await expect(poolRect).not.toHaveCSS('fill', CHANGED);

    await element(page, 'Participant_Order').click({ force: true });
    await expect(groupHeader(page, 'General')).toHaveCSS('background-color', CHANGED);

    expect(unmapped(warnings)).toEqual([]);
});

test('edit mode: an edit of the process paints the root panel', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ mode: 'edit', editSide: 'target' }),
        fixtures: { xmlByRef: { 'base-sha': C7_PAYMENT_BASE_BPMN, 'mr-sha': C7_PAYMENT_BASE_BPMN } }
    });

    await page.evaluate(() => {
        const modeler = window.__bpmnDifferModeler;
        const root = modeler.get('canvas').getRootElement();
        modeler.get('modeling').updateProperties(root, { 'camunda:historyTimeToLive': '180' });
    });
    await expect(groupHeader(page, 'History cleanup')).toHaveCSS('background-color', CHANGED, { timeout: 5000 });
    // The root has no shape: nothing on the canvas takes the diff colour
    await expect(page.locator('svg .djs-element[class*="edit-diff"]')).toHaveCount(0);
});

test('edit mode: the MR diff strokes the pool, as the view does', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ mode: 'edit', editSide: 'source' }),
        fixtures: { xmlByRef: { 'base-sha': C8_ORDER_MAIN_BASE_BPMN, 'mr-sha': C8_ORDER_MAIN_CHANGED_BPMN } }
    });

    const poolRect = element(page, 'Participant_Order').locator('.djs-visual > rect').first();
    await expect(poolRect).toHaveCSS('stroke', 'rgb(0, 0, 170)', { timeout: 5000 });
    await expect(poolRect).toHaveCSS('stroke-width', '4px');
    await expect(poolRect).not.toHaveCSS('fill', CHANGED);

    // The downloaded file looks the way the canvas does
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByTitle('Download the edited .bpmn').click()
    ]);
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    const xml = Buffer.concat(chunks).toString('utf8');
    expect(xml).toMatch(/id="Participant_Order_di"[^>]*color:border-color="#0000aa"/);
    expect(xml).not.toMatch(/id="Participant_Order_di"[^>]*background-color/);
});

// BUG-0052: the collaboration's own content — here a renamed message flow and a
// renamed black-box pool — is diffed like the process content.
test('a collaboration: message flows and black-box pools', async ({ page }) => {
    const changed = replaceOnce(
        replaceOnce(C7_ORDER_MAIN_BASE_BPMN, '<bpmn:messageFlow id="MFlow_1" ', '<bpmn:messageFlow id="MFlow_1" name="New order" '),
        'name="Kafka: order.events"', 'name="Kafka: orders"');
    const warnings = await boot(page, C7_ORDER_MAIN_BASE_BPMN, changed);

    await expect(page.locator('td:has-text("Changed:") + td')).toHaveText('2');
    await page.getByRole('button', { name: 'Show changes' }).click();
    const rows = page.locator('table.changes-table tbody tr');
    await expect(rows.filter({ hasText: 'MFlow_1' }).locator('td').nth(2)).toHaveText('General');
    await expect(rows.filter({ hasText: 'Participant_Kafka' }).locator('td').nth(2)).toHaveText('General');

    await element(page, 'MFlow_1').click({ force: true });
    await expect(groupHeader(page, 'General')).toHaveCSS('background-color', CHANGED);

    // The other side of the MR lists the same two
    await page.getByRole('button', { name: /Switch/ }).click();
    await expect(page.locator('td:has-text("Changed:") + td')).toHaveText('2');
    await expect(rows.filter({ hasText: 'Participant_Kafka' })).toHaveCount(1);

    expect(unmapped(warnings)).toEqual([]);
});

test('a collaboration: an added message flow', async ({ page }) => {
    const flow = '<bpmn:messageFlow id="MFlow_2" sourceRef="Participant_Kafka" targetRef="AwaitPayment" />';
    const edge = '<bpmndi:BPMNEdge id="MFlow_2_di" bpmnElement="MFlow_2">\n'
        + '        <di:waypoint x="1060" y="150" />\n'
        + '        <di:waypoint x="1060" y="360" />\n'
        + '      </bpmndi:BPMNEdge>';
    const base = replaceOnce(replaceOnce(C7_ORDER_MAIN_BASE_BPMN, flow, ''), edge, '');
    await boot(page, base, C7_ORDER_MAIN_BASE_BPMN);

    await expect(page.locator('td:has-text("Added:") + td')).toHaveText('1');
    await page.getByRole('button', { name: 'Show changes' }).click();
    const row = page.locator('table.changes-table tbody tr', { hasText: 'MFlow_2' });
    await expect(row.locator('.changes-table-badge')).toHaveAttribute('title', 'added');
    await expect(row.locator('.changes-table-type')).toHaveAttribute('title', 'MessageFlow');
});

// The case BUG-0050 was reported on: the sandbox's pool-less Fulfillment.bpmn, main vs
// c7/model-changes, whose only change is the process listener's event (start -> end).
test('the reported case: a process listener of the pool-less Fulfillment', async ({ page }) => {
    const warnings = await boot(page, C7_FULFILLMENT_BASE_BPMN, C7_FULFILLMENT_CHANGED_BPMN);

    await expect(groupHeader(page, 'Execution listeners')).toHaveCSS('background-color', CHANGED);
    await expect(page.locator('td:has-text("Changed:") + td')).toHaveText('1');
    await page.getByRole('button', { name: 'Show changes' }).click();
    await expect(page.locator('table.changes-table tbody tr', { hasText: 'FulfillmentProcess' }).locator('td').nth(2))
        .toHaveText('Execution listeners');

    expect(unmapped(warnings)).toEqual([]);
});

test('Camunda 8: a pool-less process paints the root panel', async ({ page }) => {
    const changed = replaceOnce(C8_FULFILLMENT_BASE_BPMN, '<zeebe:versionTag value="1.0" />', '<zeebe:versionTag value="1.1" />');
    const warnings = await boot(page, C8_FULFILLMENT_BASE_BPMN, changed);

    await expect(groupHeader(page, 'General')).toHaveCSS('background-color', CHANGED);
    await page.getByRole('button', { name: 'Show changes' }).click();
    await expect(page.locator('table.changes-table tbody tr', { hasText: 'FulfillmentC8' }).locator('td').nth(2))
        .toHaveText('General');

    expect(unmapped(warnings)).toEqual([]);
});
