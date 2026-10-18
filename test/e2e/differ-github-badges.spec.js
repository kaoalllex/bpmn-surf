'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, HANDLER_BADGES_BPMN, LISTENER_BADGES_BPMN, MESSAGE_CORRELATION_BPMN
} = require('./support/boot-differ');
const { installHandlerOpenCapture, getOpenCalls, getNavigated } = require('./support/handler-open-capture');
const correlationCapture = require('./support/correlation-open-capture');
const { ORIGIN, PROJECT, githubParams, routeGitHub, prFileDiffUrl } = require('./support/github-routes');

// Handler, listener and correlation badges through the real GitHub client
// (support/github-routes.js): the twins of differ-handler-badge-*, differ-listener-badges
// and differ-correlation-badge, which run on FakePlatformClient.
const GREEN = 'rgb(136, 255, 136)';
const BLUE = 'rgb(136, 136, 255)';
const RED = 'rgb(255, 136, 136)';

async function clickBadge(page, id, badge = '.handler-link') {
    await page.locator(`svg .djs-element[data-element-id="${id}"]`).click();
    await page.locator(`.djs-overlay-note ${badge}`).click();
}

test('an unchanged handler opens the file the default-branch search finds, at the PR head', async ({ page }) => {
    wireDiagnostics(page);
    await routeGitHub(page, {
        raw: { 'diagram.bpmn': HANDLER_BADGES_BPMN },
        searchHits: [{ path: 'src/PrepareDelegate.kt', line: 5, snippet: 'class PrepareDelegate' }]
    });
    await bootBpmnDiffer(page, { params: githubParams(), realClient: true });
    await installHandlerOpenCapture(page);

    await clickBadge(page, 'ClassTask');

    await expect.poll(() => getNavigated(page)).toEqual([`${PROJECT}/blob/mr-sha/src/PrepareDelegate.kt#L5`]);
});

test('a handler nobody finds opens the host\'s search page', async ({ page }) => {
    wireDiagnostics(page);
    await routeGitHub(page, { raw: { 'diagram.bpmn': HANDLER_BADGES_BPMN }, searchHits: [] });
    await bootBpmnDiffer(page, { params: githubParams(), realClient: true });
    await installHandlerOpenCapture(page);

    await clickBadge(page, 'ClassTask');

    await expect.poll(async () => (await getNavigated(page)).length).toBe(1);
    const url = new URL((await getNavigated(page))[0]);
    expect(url.origin + url.pathname).toBe(`${ORIGIN}/search`);
    expect(url.searchParams.get('q')).toBe('repo:acme/flows PrepareDelegate');
});

test('handlers the PR changes get permanent badges coloured by status, opening their diff in the PR', async ({ page }) => {
    wireDiagnostics(page);
    await routeGitHub(page, {
        raw: {
            'diagram.bpmn': HANDLER_BADGES_BPMN,
            // added/changed are read at the PR head (mr-sha), removed at the target (base-sha).
            'mr-sha:src/ScoreCarTask.kt': '@ExternalTaskSubscription("scoreCar")\nclass ScoreCarTask',
            'mr-sha:src/PrepareDelegate.kt': 'class PrepareDelegate',
            'base-sha:src/NotifyDelegate.kt': 'class NotifyDelegate'
        },
        prFiles: { 'src/ScoreCarTask.kt': 'ADDED', 'src/PrepareDelegate.kt': 'MODIFIED', 'src/NotifyDelegate.kt': 'DELETED' }
    });
    await bootBpmnDiffer(page, { params: githubParams(), realClient: true });
    await installHandlerOpenCapture(page);

    for (const [status, colour] of [['added', GREEN], ['changed', BLUE], ['removed', RED]]) {
        const badge = page.locator(`.handler-link-${status}`);
        await expect(badge).toBeVisible();
        await expect(badge).toHaveCSS('background-color', colour);
        await expect(badge).toHaveAttribute('title', `Handler ${status} in this PR — open its diff`);
    }

    await page.locator('.handler-link-added').click();
    await expect.poll(() => getOpenCalls(page)).toEqual([prFileDiffUrl('src/ScoreCarTask.kt')]);
});

test('a listener class the PR changes paints a permanent listener badge', async ({ page }) => {
    wireDiagnostics(page);
    await routeGitHub(page, {
        raw: { 'diagram.bpmn': LISTENER_BADGES_BPMN, 'mr-sha:src/AuditDelegate.kt': 'class AuditDelegate' },
        prFiles: { 'src/AuditDelegate.kt': 'MODIFIED' }
    });
    await bootBpmnDiffer(page, { params: githubParams(), realClient: true });

    const listener = page.locator('.djs-overlays[data-container-id="ClassTask"] .handler-link-listener');
    await expect(listener).toHaveCount(1);
    await expect(listener).toHaveCSS('background-color', BLUE);
    await expect(listener).toHaveAttribute('title', 'Execution listener (start) changed in this PR — open its diff');
});

test('an unchanged listener opens the file the search finds', async ({ page }) => {
    wireDiagnostics(page);
    await routeGitHub(page, {
        raw: { 'diagram.bpmn': LISTENER_BADGES_BPMN },
        searchHits: [{ path: 'src/AuditDelegate.kt', line: 3, snippet: 'class AuditDelegate' }]
    });
    await bootBpmnDiffer(page, { params: githubParams(), realClient: true });
    await installHandlerOpenCapture(page);

    await page.locator('svg .djs-element[data-element-id="ClassTask"]').click();
    await page.locator('.djs-overlays[data-container-id="ClassTask"] .handler-link-listener').click();

    await expect.poll(() => getNavigated(page)).toEqual([`${PROJECT}/blob/mr-sha/src/AuditDelegate.kt#L3`]);
});

test('jumps to the single correlation point the search finds', async ({ page }) => {
    wireDiagnostics(page);
    await routeGitHub(page, {
        raw: { 'diagram.bpmn': MESSAGE_CORRELATION_BPMN },
        searchHits: [{ path: 'src/OrderListener.kt', line: 14, snippet: 'runtimeService.correlateMessage("OrderPlaced")' }]
    });
    await bootBpmnDiffer(page, { params: githubParams(), realClient: true });
    await correlationCapture.installOpenCapture(page);

    await clickBadge(page, 'ReceiveTask_1', '.correlation-link');

    await expect.poll(() => correlationCapture.getOpenCalls(page)).toEqual([`${PROJECT}/blob/mr-sha/src/OrderListener.kt#L14`]);
});

test('finds a correlation point in a file the PR changes while the search is rate limited', async ({ page }) => {
    wireDiagnostics(page);
    await routeGitHub(page, {
        raw: {
            'diagram.bpmn': MESSAGE_CORRELATION_BPMN,
            'mr-sha:src/OrderListener.kt': 'package x\n\nclass OrderListener {\n    fun on() = runtimeService.correlateMessage("OrderPlaced")\n}'
        },
        searchHits: null,
        prFiles: { 'src/OrderListener.kt': 'MODIFIED' }
    });
    await bootBpmnDiffer(page, { params: githubParams(), realClient: true });
    await correlationCapture.installOpenCapture(page);

    await clickBadge(page, 'ReceiveTask_1', '.correlation-link');

    await expect.poll(() => correlationCapture.getOpenCalls(page)).toEqual([`${PROJECT}/blob/mr-sha/src/OrderListener.kt#L4`]);
});
