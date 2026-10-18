// The Firefox build in a real Firefox, signed out, on the frozen demo project.
//
//   node test/e2e/live/firefox-smoke.mjs [--only gitlab,github] [--headed] [--shots <dir>]
//
// Driven over WebDriver BiDi, which Firefox has built in: Playwright cannot load
// a Firefox extension. The extension is the --firefox manifest
// (scripts/firefox-manifest.js) over the working tree, with gitlab.com and
// github.com baked into host_permissions, so no popup step (the permission
// prompt stays a manual check). It walks the paths that differ in Firefox — the
// event-page worker registering the content scripts, and the differ tab a
// content script opens (utils.js#openBlankTab) — plus the tabs a differ opens:
//   GitLab MR !1: the three file buttons; the BPMN and the DMN differ; dive-in
//                 from the Payment call activity; the edit tab; the blob button
//   GitHub PR #1: the three file buttons; the BPMN and the DMN differ
// Firefox: /Applications/Firefox.app, or BPMN_SURF_FIREFOX=<binary>. Node 22+ (global WebSocket).
// Exits 1 when a check fails, 3 when a platform rate-limited the anonymous run.
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from './support.mjs';

const { toFirefoxManifest } = createRequire(import.meta.url)(join(REPO_ROOT, 'scripts', 'firefox-manifest.js'));

const GITLAB = 'https://gitlab.com/kao.alllex/bpmn-surf-demo';
const GITHUB = 'https://github.com/kaoalllex/bpmn-surf-demo';
const DIAGRAMS = ['OrderMain.bpmn', 'Payment.bpmn', 'PaymentRisk.dmn'];
const BLOB_PATH = 'order-service/src/main/resources/bpmn/OrderMain.bpmn';
const FIREFOX = process.env.BPMN_SURF_FIREFOX || '/Applications/Firefox.app/Contents/MacOS/firefox';
// Logged when a differ tab cannot be opened or written into: the Firefox regressions.
const TAB_FAILURE = /cannot open the diff|SecurityError|Permission denied to access/;

const arg = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const only = (arg('--only') || 'gitlab,github').split(',');
if (only.some(name => !['gitlab', 'github'].includes(name))) {
    console.error('usage: firefox-smoke.mjs [--only gitlab,github] [--headed] [--shots <dir>]');
    process.exit(2);
}
const shotsDir = arg('--shots');
let failures = 0;
let rateLimited = false;
const fail = message => { failures++; console.log('  FAIL ' + message); };
const ok = message => console.log('  ok   ' + message);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const work = mkdtempSync(join(tmpdir(), 'bpmn-surf-firefox-'));
const extDir = join(work, 'extension');
const profileDir = join(work, 'profile');
mkdirSync(profileDir, { recursive: true });
for (const dir of ['src', 'libs', 'icons']) {
    cpSync(join(REPO_ROOT, dir), join(extDir, dir), { recursive: true });
}
const manifest = toFirefoxManifest(JSON.parse(readFileSync(join(REPO_ROOT, 'manifest.json'), 'utf8')));
manifest.host_permissions = ['https://gitlab.com/*', 'https://github.com/*'];
writeFileSync(join(extDir, 'manifest.json'), JSON.stringify(manifest, null, 4));
writeFileSync(join(profileDir, 'user.js'), [
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.aboutwelcome.enabled", false);',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);'
].join('\n'));

let firefox;
let ws;

async function startFirefox() {
    firefox = spawn(FIREFOX, [
        '--remote-debugging-port=0', '--profile', profileDir, '--no-remote', '--new-instance',
        ...(process.argv.includes('--headed') ? [] : ['--headless'])
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    const endpoint = await new Promise((res, rej) => {
        let err = '';
        const timer = setTimeout(() => rej(new Error('Firefox did not start BiDi:\n' + err)), 30000);
        firefox.on('error', rej);
        firefox.stderr.on('data', d => {
            err += d;
            const match = /WebDriver BiDi listening on (ws:\/\/\S+)/.exec(err);
            if (match) {
                clearTimeout(timer);
                res(match[1]);
            }
        });
    });
    ws = new WebSocket(endpoint + '/session');
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = onMessage;
    // A dead connection answers nothing: fail what waits instead of hanging.
    ws.onclose = () => {
        for (const { rej } of pending.values()) rej(new Error('BiDi connection closed'));
        pending.clear();
    };
}

let nextId = 1;
const pending = new Map();
const logs = [];
function onMessage(message) {
    const msg = JSON.parse(message.data);
    if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.type === 'error' ? rej(new Error(`${msg.error}: ${msg.message}`)) : res(msg.result);
    } else if (msg.method === 'log.entryAdded') {
        const p = msg.params;
        logs.push({ level: p.level, text: p.text || (p.args || []).map(a => a.value ?? a.type).join(' ') });
    }
}
const send = (method, params = {}) => new Promise((res, rej) => {
    const id = nextId++;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
});
async function evaluate(context, expression, userActivation = false) {
    const r = await send('script.evaluate', { target: { context }, expression, awaitPromise: true, userActivation });
    return r.exceptionDetails ? null : r.result?.value;
}

async function waitFor(context, expression, timeout = 30000) {
    for (const end = Date.now() + timeout; Date.now() < end; await sleep(500)) {
        const value = await evaluate(context, expression).catch(() => null);
        if (value) return value;
    }
    return null;
}

// A real pointer click: bpmn-js selects an element on mouse events a synthetic click lacks.
async function realClick(context, selector) {
    const found = await send('script.evaluate', {
        target: { context }, expression: `document.querySelector(${JSON.stringify(selector)})`, awaitPromise: false
    });
    if (!found.result?.sharedId) return false;
    await send('input.performActions', { context, actions: [{ type: 'pointer', id: 'mouse', actions: [
        { type: 'pointerMove', x: 0, y: 0, origin: { type: 'element', element: { sharedId: found.result.sharedId } } },
        { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }
    ] }] });
    return true;
}

const contextIds = async () => (await send('browsingContext.getTree', { maxDepth: 0 })).contexts.map(c => c.context);

// Runs `action` and waits for the differ tab it opens to render: a standards-mode
// document (openDiffer's doctype) with a diagram or a decision table in it.
async function differOpenedBy(action, readyExpression = `document.querySelector('.djs-element, table')`) {
    const before = new Set(await contextIds());
    await action();
    for (const end = Date.now() + 30000; Date.now() < end; await sleep(500)) {
        for (const context of await contextIds()) {
            if (before.has(context)) continue;
            const title = await waitFor(context,
                `document.compatMode === 'CSS1Compat' && ${readyExpression} ? document.title : ''`, 15000);
            if (title) {
                await shoot(context, title);
                return { context, title };
            }
        }
    }
    return null;
}

async function shoot(context, name) {
    if (!shotsDir) return;
    mkdirSync(shotsDir, { recursive: true });
    await send('browsingContext.activate', { context });
    const { data } = await send('browsingContext.captureScreenshot', { context });
    writeFileSync(join(shotsDir, `firefox-${name.replace(/[^\w.-]+/g, '_')}.png`), Buffer.from(data, 'base64'));
}

const buttonSelector = '[data-bpmn-surf-file-path] .bpmn-surf-btn-with-icon';
const clickButtonFor = (page, fileName) => evaluate(page, `(() => {
    const button = [...document.querySelectorAll(${JSON.stringify(buttonSelector)})]
        .find(b => b.closest('[data-bpmn-surf-file-path]').dataset.bpmnSurfFilePath.endsWith('/' + ${JSON.stringify(fileName)}));
    button?.click();
    return !!button;
})()`, true);

// Opens `url` in a fresh tab and waits for the buttons; null when the platform
// served its rate-limit page instead.
async function openPlatformPage(url, expectedButtons) {
    const { context } = await send('browsingContext.create', { type: 'tab' });
    await send('browsingContext.navigate', { context, url, wait: 'complete' });
    const count = await waitFor(context,
        `document.querySelectorAll(${JSON.stringify(buttonSelector)}).length >= ${expectedButtons} && document.querySelectorAll(${JSON.stringify(buttonSelector)}).length`);
    if (!count && await evaluate(context, `/rate limit|too many requests/i.test(document.body.innerText)`)) {
        console.log(`  RATE LIMITED ${url}`);
        rateLimited = true;
        return null;
    }
    return { context, count };
}

async function checkChangeButtons(label, url) {
    const page = await openPlatformPage(url, DIAGRAMS.length);
    if (!page) return null;
    const files = await evaluate(page.context, `[...document.querySelectorAll(${JSON.stringify(buttonSelector)})]
        .map(b => b.closest('[data-bpmn-surf-file-path]').dataset.bpmnSurfFilePath.split('/').pop()).sort().join(',')`);
    files === [...DIAGRAMS].sort().join(',') ? ok(`${label}: buttons on ${files}`) : fail(`${label}: buttons on "${files}", expected ${DIAGRAMS.join(', ')}`);
    return page.context;
}

async function checkDiffer(label, page, fileName) {
    const differ = await differOpenedBy(() => clickButtonFor(page, fileName));
    differ?.title === fileName ? ok(`${label}: ${fileName} differ rendered`) : fail(`${label}: ${fileName} differ did not render (${differ?.title ?? 'no tab'})`);
    return differ;
}

async function gitlab() {
    console.log(`GitLab — ${GITLAB}/-/merge_requests/1`);
    const page = await checkChangeButtons('MR !1', `${GITLAB}/-/merge_requests/1/diffs`);
    if (!page) return;
    const bpmn = await checkDiffer('MR !1', page, 'OrderMain.bpmn');
    if (bpmn) {
        const nested = await differOpenedBy(async () => {
            const badge = `document.querySelector('.djs-overlay-note .dive-in-call-activity')`;
            // The canvas may still be fitting the diagram: a click on the moving element misses.
            for (let attempt = 0; attempt < 5 && !await evaluate(bpmn.context, badge); attempt++) {
                await realClick(bpmn.context, 'svg .djs-element[data-element-id="Payment"]');
                await waitFor(bpmn.context, badge, 2000);
            }
            await realClick(bpmn.context, '.djs-overlay-note .dive-in-call-activity');
        });
        nested?.title === 'Payment.bpmn' ? ok('dive-in: Payment.bpmn opened') : fail(`dive-in: ${nested?.title ?? 'no tab'}`);
        const edit = await differOpenedBy(() => realClick(bpmn.context, '[title="Edit this diagram in a new tab"]'),
            `document.querySelector('.djs-palette')`);
        edit ? ok('edit tab: palette rendered') : fail('edit tab did not open');
    }
    await checkDiffer('MR !1', page, 'PaymentRisk.dmn');

    const blob = await openPlatformPage(`${GITLAB}/-/blob/feature/express-checkout/${BLOB_PATH}`, 1);
    if (blob) {
        const differ = await differOpenedBy(() => evaluate(blob.context, `document.querySelector(${JSON.stringify(buttonSelector)}).click()`, true));
        differ?.title === 'OrderMain.bpmn' ? ok('blob view: differ rendered') : fail(`blob view: ${differ?.title ?? 'no tab'}`);
    }
}

async function github() {
    console.log(`GitHub — ${GITHUB}/pull/1`);
    const page = await checkChangeButtons('PR #1', `${GITHUB}/pull/1/files`);
    if (!page) return;
    await checkDiffer('PR #1', page, 'OrderMain.bpmn');
    await checkDiffer('PR #1', page, 'PaymentRisk.dmn');
}

try {
    await startFirefox();
    await send('session.new', { capabilities: {} });
    await send('session.subscribe', { events: ['log.entryAdded'] });
    await send('webExtension.install', { extensionData: { type: 'path', path: extDir } });
    // The event page registers the content scripts on install; a page loaded before that gets none.
    await sleep(4000);
    if (only.includes('gitlab')) await gitlab();
    if (only.includes('github')) await github();
    for (const entry of logs.filter(e => TAB_FAILURE.test(e.text))) {
        fail(`logged: ${entry.text.slice(0, 200)}`);
    }
} catch (e) {
    fail(`driver: ${e.message}`);
} finally {
    if (ws?.readyState === WebSocket.OPEN) {
        await send('session.end').catch(() => {});
    }
    if (firefox && firefox.exitCode === null && firefox.signalCode === null) {
        const exited = new Promise(res => firefox.once('exit', res));
        firefox.kill();
        await exited;
    }
    rmSync(work, { recursive: true, force: true });
}

console.log(failures ? `RESULT: ${failures} failure(s)` : rateLimited ? 'RESULT: RATE LIMITED (re-run later)' : 'RESULT: OK');
process.exit(failures ? 1 : rateLimited ? 3 : 0);
