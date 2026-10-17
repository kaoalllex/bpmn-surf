// Shared plumbing for the live harness. Not part of `npm test` or
// `playwright test` — see README.md in this directory.
import { chromium } from '@playwright/test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// One wall-time line per run, to see where a smoke's time goes.
process.once('exit', () => console.log(`TIME: ${basename(process.argv[1] || '?')} ${process.uptime().toFixed(1)} s`));

/** True when the module at `url` was run directly (`node <it>`), not imported by smoke.mjs. */
export function isMain(url) {
    return !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(url);
}
// The sandbox unless BPMN_SURF_PROJECT names another project — the frozen
// showcase, for one, whose rules differ (README.md, "The demo project").
export const PROJECT = process.env.BPMN_SURF_PROJECT || 'https://gitlab.com/kao.alllex/bpmn-surf-test';

// One browser profile, reused by every script here. NOT a saved storageState:
// GitLab rotates its session cookie on use, so a frozen copy replayed from
// several profiles gets invalidated server-side — which is exactly what happened
// the first time this harness signed in. A live profile rotates with it.
export const PROFILE_DIR = join(homedir(), '.config', 'bpmn-surf-browser-profile');

// BPMN_SURF_ANONYMOUS=1 ignores the signed-in profile: what a visitor without
// a GitLab account sees, without signing the shared profile out.
export function hasProfile() {
    return !process.env.BPMN_SURF_ANONYMOUS && existsSync(PROFILE_DIR);
}

// The hosts the harness drives. The tracked manifest declares no site — the user
// turns each one on in the popup — so the copy loaded here bakes them in, the way
// an internal build does (scripts/package.sh).
const LIVE_HOSTS = ['https://gitlab.com/*', 'https://github.com/*'];

// A fixed path keeps the unpacked extension's id stable across runs, as loading
// it from REPO_ROOT did.
const STAGED_EXTENSION = join(tmpdir(), 'bpmn-surf-live-extension');

// Once per process: smoke.mjs launches several browsers, and the copy must not be
// replaced under one that has it loaded.
let staged = false;

function stageExtension() {
    if (staged) {
        return STAGED_EXTENSION;
    }
    staged = true;
    rmSync(STAGED_EXTENSION, { recursive: true, force: true });
    for (const entry of ['manifest.json', 'src', 'libs', 'icons']) {
        cpSync(join(REPO_ROOT, entry), join(STAGED_EXTENSION, entry), { recursive: true });
    }
    const manifestPath = join(STAGED_EXTENSION, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.host_permissions = LIVE_HOSTS;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 4));
    return STAGED_EXTENSION;
}

// The service worker registers the content scripts asynchronously after the
// extension loads; a page opened before that would get no buttons.
async function waitForContentScripts(context) {
    const isOurs = w => w.url().endsWith('/src/background/service-worker.js');
    const worker = context.serviceWorkers().find(isOurs)
        || await context.waitForEvent('serviceworker', { predicate: isOurs, timeout: 10000 });
    for (let attempt = 0; attempt < 100; attempt++) {
        if ((await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts())).length) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('the extension registered no content scripts within 10 s');
}

/**
 * A browser with the unpacked extension loaded, the way Chrome loads it from
 * chrome://extensions. A persistent context is required: extensions do not load
 * into an ordinary one. The extension is a staged copy with gitlab.com and
 * github.com baked in; this resolves once its content scripts are registered.
 *
 * Uses the signed-in profile when there is one (and `anonymous` is not set), a
 * throwaway profile otherwise — so everything still runs anonymously, which is
 * enough for a public project except for per-user preferences. Only one script at a
 * time: Chromium locks the profile directory.
 */
export async function launchWithExtension({ headless = true, withExtension = true, anonymous = false, ...contextOptions } = {}) {
    const dir = !anonymous && hasProfile() ? PROFILE_DIR : mkdtempSync(join(tmpdir(), 'bpmn-surf-'));
    const extension = withExtension ? stageExtension() : null;
    const args = extension
        ? [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
        : [];
    const context = await chromium.launchPersistentContext(dir, { channel: 'chromium', headless, args, ...contextOptions });
    if (extension) {
        await waitForContentScripts(context);
    }
    return context;
}

export function createProfileDir() {
    mkdirSync(PROFILE_DIR, { recursive: true });
    return PROFILE_DIR;
}

/** The signed-in username, or null when the profile is anonymous or expired. */
export async function signedInAs(page) {
    try {
        return await page.evaluate(async () => {
            const response = await fetch('/api/v4/user', { credentials: 'include' });
            return response.ok ? (await response.json()).username : null;
        });
    } catch (error) {
        return null;
    }
}

/** The signed-in GitHub login, or null when the profile is anonymous or expired. Expects a github.com page. */
export async function githubSignedInAs(page) {
    try {
        return await page.evaluate(() => document.querySelector('meta[name="user-login"]')?.content || null);
    } catch (error) {
        return null;
    }
}

/**
 * Opens <path> in the differ: from MR !<mr>'s "Schema diff" button (the MR side
 * shown) when `mr` is given, else from the blob view of <ref> — on GitLab or, with
 * BPMN_SURF_PROJECT on github.com, on GitHub. Resolves once the diagram or the
 * decision table is drawn, with the source tab and the differ tab.
 */
export async function openDiffer(context, { mr, ref, path, width = 1500, height = 1000 }) {
    const github = new URL(PROJECT).hostname === 'github.com';
    const source = await context.newPage();
    await source.setViewportSize({ width: 1500, height: 1000 });
    const differOpened = context.waitForEvent('page', { timeout: 60000 });
    if (mr) {
        await source.goto(`${PROJECT}/-/merge_requests/${mr}/diffs`, { waitUntil: 'domcontentloaded' });
        const button = source.locator(`.bpmn-surf-file-btn[data-bpmn-surf-file-path="${path}"] button`).first();
        await button.waitFor({ timeout: 60000 });
        await button.click();
    } else {
        await source.goto(`${PROJECT}${github ? '' : '/-'}/blob/${ref}/${path}`, { waitUntil: 'domcontentloaded' });
        const button = github
            ? source.locator('#bpmn-surf-gh-branch button').first()
            : source.locator('#btn_77844bf3d4e842caa0d88194431197c0-btn');
        await button.waitFor({ timeout: 60000 });
        await button.click();
    }
    const differ = await differOpened;
    await differ.setViewportSize({ width, height });
    await differ.locator('svg .djs-element, .tjs-table').first().waitFor({ timeout: 60000 });
    // Highlights and permanent badges land after the first paint.
    await settle(() => differ.evaluate(() => document.querySelectorAll('.djs-element, .djs-overlay, .tjs-table td').length),
        { quietMs: 1000, timeout: 10000 });
    return { source, differ };
}

const nonEmpty = v => !!v && (!Array.isArray(v) || v.length > 0);

/** settle()'s readiness for a list of file blocks: rendered, and every diagram block decorated. */
export const decorated = blocks => blocks.length > 0 && blocks.every(b => !b.diagram || b.buttons.length > 0);

/**
 * Polls `snapshot()` (any JSON-able value) until `ready` holds and the value has not
 * changed for `quietMs` — the page has finished rendering and we have finished
 * decorating it. Resolves with the last value, settled or not once `timeout` runs out
 * (a check that fails waits the whole timeout).
 */
export async function settle(snapshot, { ready = nonEmpty, quietMs = 2000, timeout = 30000, interval = 250 } = {}) {
    const t0 = Date.now();
    let last;
    let lastKey;
    let since = Date.now();
    while (Date.now() - t0 < timeout) {
        last = await snapshot();
        const key = JSON.stringify(last);
        if (key !== lastKey) {
            lastKey = key;
            since = Date.now();
        } else if (ready(last) && Date.now() - since >= quietMs) {
            return last;
        }
        await new Promise(r => setTimeout(r, interval));
    }
    return last;
}

/**
 * The per-block contract shared by mr-button.mjs and pr-button.mjs: a diagram block
 * carries exactly one button, for its own file, with the right label; any other
 * block carries none. Blocks are { path, diagram, buttons: [{ path, text }] }.
 */
export function checkBlocks(list, label, fail) {
    for (const b of list) {
        if (b.diagram && b.buttons.length !== 1) fail(`${label}: ${b.path} has ${b.buttons.length} buttons, expected 1`);
        if (!b.diagram && b.buttons.length) fail(`${label}: ${b.path} is not a diagram but has a button`);
        for (const btn of b.buttons) {
            if (btn.path !== b.path) fail(`${label}: button for ${btn.path} sits on ${b.path}`);
            const expected = b.path.endsWith('.dmn') ? 'Decision diff' : 'Schema diff';
            if (btn.text !== expected) fail(`${label}: ${b.path} says "${btn.text}", expected "${expected}"`);
        }
    }
}

/** How many of our file buttons are inserted or removed while the page sits idle for `ms`. */
export async function idleChurn(page, ms = 3000) {
    await page.evaluate(() => {
        window.__bpmnSurfChurn = 0;
        new MutationObserver(ms => ms.forEach(m => [...m.addedNodes, ...m.removedNodes]
            .forEach(n => { if (n.classList?.contains('bpmn-surf-file-btn')) window.__bpmnSurfChurn++; })))
            .observe(document.body, { childList: true, subtree: true });
    });
    await page.waitForTimeout(ms);
    return page.evaluate(() => window.__bpmnSurfChurn);
}

/** The differ tab's two side labels: the one shown, then the other after Switch branch. */
export async function differSides(differ) {
    const side = async () => ((await differ.locator('.differ-toolbar span', { hasText: '·' }).first()
        .textContent({ timeout: 30000 }).catch(() => null)) || 'no side label').trim();
    const shown = await side();
    const switchButton = differ.getByRole('button', { name: 'Switch branch' });
    let other = 'no Switch';
    if (await switchButton.isEnabled().catch(() => false)) {
        await switchButton.click();
        other = await settle(async () => { const s = await side(); return s !== shown && s; }, { quietMs: 0, timeout: 10000 }) || shown;
    }
    return { shown, other };
}

/** The extension's own console output, filtered to the lines worth reading. */
export function collectExtensionLog(page, pattern = /selected file|button|diff-file|cannot|not selected/i) {
    const lines = [];
    page.on('console', m => {
        const text = m.text();
        if (pattern.test(text)) {
            lines.push(text.slice(0, 160));
        }
    });
    return lines;
}
