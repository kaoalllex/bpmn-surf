'use strict';

const crypto = require('node:crypto');
const { defaultBpmnParams } = require('./boot-differ');

// The real GitHub client against a host that is not github.com (as on GitHub
// Enterprise Server): the differ's own origin plays the GitHub host, routes play its
// search page, raw files and the PR's "Files changed" page. The GitHub twin of the
// FakePlatformClient fixtures: the same hits and files, served the way GitHub serves them.
const ORIGIN = 'http://localhost:4173';
const PROJECT = `${ORIGIN}/acme/flows`;

function githubParams(overrides = {}) {
    return defaultBpmnParams({
        platform: { kind: 'github', projectUrl: PROJECT, hostUrl: ORIGIN, projectId: 'acme/flows' },
        changeRequestId: 7,
        ...overrides
    });
}

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// raw:        { [path]: content } at any ref, or { [`${ref}:${path}`]: content } at one ref;
// searchHits: what github.com's code search answers to every query, as FakePlatformClient's
//             { path, line, snippet }; null answers 429 (rate limited, or signed out);
// prFiles:    { [path]: changeType } (ADDED | MODIFIED | DELETED) listed by PR #7's payload.
async function routeGitHub(page, { raw = {}, searchHits = [], prFiles = {} } = {}) {
    await page.route(`${PROJECT}/raw/**`, (route) => {
        // /acme/flows/raw/<ref>/<path…>
        const rest = new URL(route.request().url()).pathname.split('/acme/flows/raw/')[1].split('/');
        const ref = decodeURIComponent(rest[0]);
        const file = decodeURIComponent(rest.slice(1).join('/'));
        const body = raw[`${ref}:${file}`] ?? raw[file] ?? null;
        return body === null ? route.fulfill({ status: 404, body: '' }) : route.fulfill({ status: 200, body });
    });
    await page.route(`${ORIGIN}/search?**`, (route) => route.fulfill(searchHits ? {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ payload: { blackbirdSearchRoute: { logged_in: true, errors: [], results: searchHits.map(hit => ({
            path: hit.path,
            snippets: [{ lines: hit.snippet.split('\n').map(escapeHtml), starting_line_number: hit.line }]
        })) } } })
    } : { status: 429, contentType: 'text/html', body: '<html></html>' }));
    const data = { payload: {
        pullRequestsChangesRoute: {
            diffSummaries: Object.entries(prFiles).map(([path, changeType]) => ({ path, changeType })),
            diffContents: []
        },
        pullRequestsLayoutRoute: { pullRequest: { number: 7 } }
    } };
    await page.route(`${PROJECT}/pull/7/changes`, (route) => route.fulfill({
        status: 200, contentType: 'text/html',
        body: `<react-app app-name="repo"><script type="application/json" data-target="react-app.embeddedData">${JSON.stringify(data)}</script></react-app>`
    }));
}

/** GitHubPlatformClient#prFileDiffUrl of `path` in PR #7. */
function prFileDiffUrl(path) {
    return `${PROJECT}/pull/7/files#diff-${crypto.createHash('sha256').update(path).digest('hex')}`;
}

module.exports = { ORIGIN, PROJECT, githubParams, routeGitHub, prFileDiffUrl };
