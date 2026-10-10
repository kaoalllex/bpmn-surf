'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, CALL_ACTIVITY_BPMN } = require('./support/boot-differ');
const { installTabCapture, getOpenDifferCalls, getOpenUrlCalls } = require('./support/dive-in-capture');

// The real GitHub client against a host that is not github.com (as on GitHub
// Enterprise Server): the differ's own origin plays the GitHub host, routes
// play its search page, raw files and the PR's "Files changed" page.
const ORIGIN = 'http://localhost:4173';
const SUB = '<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D"><bpmn:process id="Sub_Process" /></bpmn:definitions>';

function githubParams() {
    return defaultBpmnParams({
        platform: { kind: 'github', projectUrl: `${ORIGIN}/acme/flows`, hostUrl: ORIGIN, projectId: 'acme/flows' },
        changeRequestId: 7
    });
}

async function routeGitHub(page, { searchResults, prFiles }) {
    await page.route(`${ORIGIN}/acme/flows/raw/**`, (route) => {
        // /acme/flows/raw/<ref>/<path…>: any ref serves the same content here.
        const rest = new URL(route.request().url()).pathname.split('/acme/flows/raw/')[1].split('/');
        const file = decodeURIComponent(rest.slice(1).join('/'));
        const body = file === 'diagram.bpmn' ? CALL_ACTIVITY_BPMN : (prFiles[file] || null);
        return body === null ? route.fulfill({ status: 404, body: '' }) : route.fulfill({ status: 200, body });
    });
    await page.route(`${ORIGIN}/search?**`, (route) => route.fulfill({
        status: searchResults ? 200 : 429,
        contentType: searchResults ? 'application/json' : 'text/html',
        body: searchResults ? JSON.stringify({ payload: { blackbirdSearchRoute: { logged_in: true, errors: [], results: searchResults } } }) : '<html></html>'
    }));
    const data = { payload: {
        pullRequestsChangesRoute: { diffSummaries: Object.keys(prFiles).map(path => ({ path, changeType: 'ADDED' })), diffContents: [] },
        pullRequestsLayoutRoute: { pullRequest: { number: 7 } }
    } };
    await page.route(`${ORIGIN}/acme/flows/pull/7/changes`, (route) => route.fulfill({
        status: 200, contentType: 'text/html',
        body: `<react-app app-name="repo"><script type="application/json" data-target="react-app.embeddedData">${JSON.stringify(data)}</script></react-app>`
    }));
}

async function diveIn(page) {
    await page.locator('svg .djs-element[data-element-id="CallActivity_1"]').click();
    await page.locator('.djs-overlay-note .dive-in-call-activity').click();
}

test('dives into a process the default-branch search finds', async ({ page }) => {
    wireDiagnostics(page);
    await routeGitHub(page, { searchResults: [{ path: 'flows/sub.bpmn', snippets: [{ lines: ['&lt;bpmn:process id=&quot;Sub_Process&quot; /&gt;'], starting_line_number: 1 }] }], prFiles: {} });
    await bootBpmnDiffer(page, { params: githubParams(), realClient: true });
    await installTabCapture(page);
    await diveIn(page);
    await expect.poll(async () => (await getOpenDifferCalls(page)).length).toBe(1);
    expect((await getOpenDifferCalls(page))[0].params.filePath).toBe('flows/sub.bpmn');
});

test('dives into a process the PR itself adds although the search is rate limited', async ({ page }) => {
    wireDiagnostics(page);
    await routeGitHub(page, { searchResults: null, prFiles: { 'flows/new-sub.bpmn': SUB } });
    await bootBpmnDiffer(page, { params: githubParams(), realClient: true });
    await installTabCapture(page);
    await diveIn(page);
    await expect.poll(async () => (await getOpenDifferCalls(page)).length).toBe(1);
    expect((await getOpenDifferCalls(page))[0].params.filePath).toBe('flows/new-sub.bpmn');
});

test('falls back to the host\'s search page when nothing is found', async ({ page }) => {
    wireDiagnostics(page);
    await routeGitHub(page, { searchResults: [], prFiles: {} });
    await bootBpmnDiffer(page, { params: githubParams(), realClient: true });
    await installTabCapture(page);
    await diveIn(page);
    await expect.poll(async () => (await getOpenUrlCalls(page)).length).toBe(1);
    expect((await getOpenUrlCalls(page))[0].startsWith(`${ORIGIN}/search?`)).toBe(true);
});
