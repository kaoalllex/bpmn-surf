'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, CALL_ACTIVITY_BPMN } = require('./support/boot-differ');
const { installTabCapture, getOpenDifferCalls, getOpenUrlCalls } = require('./support/dive-in-capture');
const { installCapture, getOpenCalls } = require('./support/dive-out-capture');
const { routeGitHub, githubParams, ORIGIN } = require('./support/github-routes');

// The repository-tree walk (ProcessFileIndex) is GitLab's API; on any other
// platform a dive-in miss must go straight to the search-page fallback.
test('a non-GitLab dive-in miss never walks the GitLab repository tree', async ({ page }) => {
    wireDiagnostics(page);
    const gitlabApiRequests = [];
    page.on('request', (request) => {
        if (request.url().includes('/api/v4/')) {
            gitlabApiRequests.push(request.url());
        }
    });
    const params = defaultBpmnParams();
    params.platform = { ...params.platform, kind: 'github' };
    await bootBpmnDiffer(page, {
        params,
        fixtures: { xmlByRef: { 'mr-sha': CALL_ACTIVITY_BPMN, 'base-sha': CALL_ACTIVITY_BPMN }, searchHits: [] }
    });
    await installTabCapture(page);

    await page.locator('svg .djs-element[data-element-id="CallActivity_1"]').click();
    await page.locator('.djs-overlay-note .dive-in-call-activity').click();

    await expect.poll(async () => (await getOpenUrlCalls(page)).length).toBe(1);
    expect(await getOpenDifferCalls(page)).toEqual([]);
    expect(gitlabApiRequests).toEqual([]);
});

// The callers list through the real GitHub client (support/github-routes.js): the twin
// of differ-dive-out-menu.spec.js. The default-branch search and the PR's own files
// both name callers; a search with no answer still lists the PR's, and with none of
// those either the menu says it could not check — never "No diagram calls this one".
const CALLER = (id) => `<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D"><bpmn:process id="${id}"><bpmn:callActivity id="Call" calledElement="Process_2" /></bpmn:process></bpmn:definitions>`;
const callerNames = (page) => page.locator('.differ-back-menu-item .differ-back-menu-name');

test('the callers list joins the default-branch search and the callers the PR adds', async ({ page }) => {
    wireDiagnostics(page);
    await routeGitHub(page, {
        raw: { 'diagram.bpmn': CALL_ACTIVITY_BPMN, 'mr-sha:flows/new-caller.bpmn': CALLER('New') },
        searchHits: [{ path: 'flows/old-caller.bpmn', line: 1, snippet: '<bpmn:callActivity id="Call" calledElement="Process_2" />' }],
        prFiles: { 'flows/new-caller.bpmn': 'ADDED' }
    });
    await bootBpmnDiffer(page, { params: githubParams(), realClient: true });

    await page.locator('.differ-back-caret').click();

    await expect(callerNames(page)).toHaveText(['new-caller.bpmn', 'old-caller.bpmn']);
});

test('with the search unanswered the callers list still shows the PR\'s own callers', async ({ page }) => {
    wireDiagnostics(page);
    await routeGitHub(page, {
        raw: { 'diagram.bpmn': CALL_ACTIVITY_BPMN, 'mr-sha:flows/new-caller.bpmn': CALLER('New') },
        searchHits: null,
        prFiles: { 'flows/new-caller.bpmn': 'ADDED' }
    });
    await bootBpmnDiffer(page, { params: githubParams(), realClient: true });

    await page.locator('.differ-back-caret').click();

    await expect(callerNames(page)).toHaveText(['new-caller.bpmn']);
});

test('with the search unanswered and no caller in the PR the callers list links to the host\'s search', async ({ page }) => {
    wireDiagnostics(page);
    await routeGitHub(page, { raw: { 'diagram.bpmn': CALL_ACTIVITY_BPMN }, searchHits: null });
    await bootBpmnDiffer(page, { params: githubParams(), realClient: true });
    await installCapture(page);

    await page.locator('.differ-back-caret').click();

    await expect(page.locator('.differ-back-menu-message')).toContainText("Couldn't check the calling diagrams.");
    await page.locator('.differ-back-menu-link').click();
    await expect.poll(async () => (await getOpenCalls(page)).length).toBe(1);
    const url = new URL((await getOpenCalls(page))[0][0]);
    expect(url.origin + url.pathname).toBe(`${ORIGIN}/search`);
    expect(url.searchParams.get('q')).toBe('repo:acme/flows calledElement="Process_2"');
});
