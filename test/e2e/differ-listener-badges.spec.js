'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, LISTENER_BADGES_BPMN, C8_ORDER_MAIN_BASE_BPMN
} = require('./support/boot-differ');
const { installHandlerOpenCapture, getNavigated } = require('./support/handler-open-capture');

// Execution / task listener badges (FEAT-0019): a column of "<event> </>" badges
// off the element's bottom-left corner, one per listener, next to (not instead
// of) the implementation badge off the bottom-right one.
const same = (xml) => ({ 'mr-sha': xml, 'base-sha': xml });
const element = (page, id) => page.locator(`svg .djs-element[data-element-id="${id}"]`);
const overlaysOf = (page, id) => page.locator(`.djs-overlays[data-container-id="${id}"]`);
const listenerBadgesOn = (page, id) => overlaysOf(page, id).locator('.handler-link-listener');
const BLUE = 'rgb(136, 136, 255)';

function changedFile(path, content) {
    return {
        params: defaultBpmnParams({ changeRequestId: 42 }),
        fixtures: {
            xmlByRef: same(LISTENER_BADGES_BPMN),
            changedFiles: [{ path, status: 'changed' }],
            contentByRefPath: { [`mr-sha:${path}`]: content }
        }
    };
}

test('a changed listener class paints a permanent badge beside the implementation badge', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, changedFile('src/AuditDelegate.kt', 'class AuditDelegate'));

    const listener = listenerBadgesOn(page, 'ClassTask');
    await expect(listener).toHaveCount(1);
    await expect(listener).toHaveClass(/handler-link-changed/);
    await expect(listener).toHaveCSS('background-color', BLUE);
    await expect(listener).toHaveAttribute('title', 'Execution listener (start) changed in this MR — open its diff');

    // Selecting the task adds its own (unchanged) implementation badge; the two never overlap.
    await element(page, 'ClassTask').click();
    const implementation = overlaysOf(page, 'ClassTask').locator('.handler-link:not(.handler-link-listener)');
    await expect(implementation).toHaveAttribute('title', 'Open the handler code');
    await expect(listener).toHaveCount(1);
    const listenerBox = await listener.boundingBox();
    const implementationBox = await implementation.boundingBox();
    const shapeBox = await element(page, 'ClassTask').locator('.djs-visual > rect').first().boundingBox();
    expect(listenerBox.x + listenerBox.width).toBeLessThanOrEqual(shapeBox.x + 1);
    expect(implementationBox.x).toBeGreaterThanOrEqual(shapeBox.x + shapeBox.width - 1);
});

test('two listeners of one class get a badge each, stacked; an expression listener gets none', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { fixtures: { xmlByRef: same(LISTENER_BADGES_BPMN) } });

    await element(page, 'Approve').click();
    const badges = listenerBadgesOn(page, 'Approve');
    await expect(badges).toHaveCount(2);
    await expect(badges).toHaveText(['create </>', 'complete </>']);
    await expect(badges.first()).toHaveAttribute('title', 'Task listener (create) — open the handler code');
    await expect(badges.last()).toHaveAttribute('title', 'Task listener (complete) — open the handler code');
    await expect(badges.first()).not.toHaveClass(/handler-link-(added|changed|removed)/);
    const create = await badges.first().boundingBox();
    const complete = await badges.last().boundingBox();
    expect(complete.y).toBeGreaterThanOrEqual(create.y + create.height);
});

test('a sequence flow listener shows on selection; a plain task gets no listener badge', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { fixtures: { xmlByRef: same(LISTENER_BADGES_BPMN) } });

    await element(page, 'Flow_2').click({ force: true });
    await expect(listenerBadgesOn(page, 'Flow_2')).toHaveCount(1);
    await expect(listenerBadgesOn(page, 'Flow_2')).toBeVisible();
    await expect(listenerBadgesOn(page, 'Flow_2')).toHaveAttribute('title',
        'Execution listener (take) — open the handler code');

    await element(page, 'PlainTask').click();
    await expect(listenerBadgesOn(page, 'Flow_2')).toHaveCount(0);
    await expect(page.locator('.handler-link-listener')).toHaveCount(0);
});

test('an unchanged listener badge opens the listener class at the shown ref', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        fixtures: {
            xmlByRef: same(LISTENER_BADGES_BPMN),
            searchHits: [{ path: 'src/ApprovalListener.kt', line: 3, snippet: 'class ApprovalListener' }]
        }
    });
    await installHandlerOpenCapture(page);

    await element(page, 'Approve').click();
    await listenerBadgesOn(page, 'Approve').first().click();

    await expect.poll(async () => await getNavigated(page)).toEqual(
        ['http://localhost/blob/mr-sha/src/ApprovalListener.kt#L3']
    );
});

test('a changed Camunda 8 listener worker marks its task', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ changeRequestId: 19 }),
        fixtures: {
            xmlByRef: same(C8_ORDER_MAIN_BASE_BPMN),
            changedFiles: [{ path: 'src/main/kotlin/AuditWorker.kt', status: 'changed' }],
            contentByRefPath: {
                'mr-sha:src/main/kotlin/AuditWorker.kt':
                    'class AuditWorker {\n    @JobWorker(type = "audit-step")\n    fun audit() {}\n}'
            }
        }
    });

    const listener = listenerBadgesOn(page, 'ValidateOrder');
    await expect(listener).toHaveCount(1);
    await expect(listener).toHaveClass(/handler-link-changed/);
    await expect(listener).toHaveAttribute('title', 'Execution listener (start) changed in this MR — open its diff');
    // The task's own job worker (validate-order) is not touched: no permanent badge.
    await expect(overlaysOf(page, 'ValidateOrder').locator('.handler-link:not(.handler-link-listener)')).toHaveCount(0);
});

test('a pool shows the listeners of its process', async ({ page }) => {
    wireDiagnostics(page);
    const pooled = LISTENER_BADGES_BPMN
        .replace('<bpmn:process id="Process_L"',
            '<bpmn:collaboration id="Collab"><bpmn:participant id="Pool" processRef="Process_L" /></bpmn:collaboration>'
            + '<bpmn:process id="Process_L"')
        .replace('bpmnElement="Process_L">', 'bpmnElement="Collab">'
            + '<bpmndi:BPMNShape id="Pool_di" bpmnElement="Pool" isHorizontal="true">'
            + '<dc:Bounds x="100" y="60" width="760" height="220" /></bpmndi:BPMNShape>');
    await bootBpmnDiffer(page, { fixtures: { xmlByRef: same(pooled) } });

    await element(page, 'Pool').click({ position: { x: 15, y: 110 } });
    await expect(listenerBadgesOn(page, 'Pool')).toHaveCount(1);
    await expect(listenerBadgesOn(page, 'Pool')).toHaveAttribute('title',
        'Execution listener (start) — open the handler code');
});

test('a flow listener column sits on the flow, clear of its source and target shapes', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { fixtures: { xmlByRef: same(LISTENER_BADGES_BPMN) } });

    await element(page, 'Flow_2').click({ force: true });
    const badge = listenerBadgesOn(page, 'Flow_2');
    await expect(badge).toBeVisible();
    const box = await badge.boundingBox();
    const source = await element(page, 'ClassTask').locator('.djs-visual > rect').first().boundingBox();
    const target = await element(page, 'Approve').locator('.djs-visual > rect').first().boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(source.x + source.width);
    expect(box.x + box.width).toBeLessThanOrEqual(target.x);
});

// A process without a pool has no shape of its own: its start events carry its listeners.
test('a changed process listener marks the start event of a pool-less process', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, changedFile('src/ProcessAuditListener.kt', 'class ProcessAuditListener'));

    const badge = listenerBadgesOn(page, 'StartEvent_1');
    await expect(badge).toHaveCount(1);
    await expect(badge).toHaveClass(/handler-link-changed/);
    await expect(badge).toHaveAttribute('title', 'Process execution listener (start) changed in this MR — open its diff');
});
