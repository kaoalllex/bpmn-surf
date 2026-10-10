// Shared plumbing for the live harness. Not part of `npm test` or
// `playwright test` — see README.md in this directory.
import { chromium } from '@playwright/test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
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

function stageExtension() {
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
 * Uses the signed-in profile when there is one, a throwaway profile otherwise —
 * so everything still runs anonymously, which is enough for a public project
 * except for per-user preferences. Only one script at a time: Chromium locks the
 * profile directory.
 */
export async function launchWithExtension({ headless = true, withExtension = true, ...contextOptions } = {}) {
    const dir = hasProfile() ? PROFILE_DIR : mkdtempSync(join(tmpdir(), 'bpmn-surf-'));
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
