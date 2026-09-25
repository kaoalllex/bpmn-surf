// Shared plumbing for the live harness. Not part of `npm test` or
// `playwright test` — see README.md in this directory.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const SANDBOX = 'https://gitlab.com/kao.alllex/bpmn-surf-test';

// One browser profile, reused by every script here. NOT a saved storageState:
// GitLab rotates its session cookie on use, so a frozen copy replayed from
// several profiles gets invalidated server-side — which is exactly what happened
// the first time this harness signed in. A live profile rotates with it.
export const PROFILE_DIR = join(homedir(), '.config', 'bpmn-surf-browser-profile');

export function hasProfile() {
    return existsSync(PROFILE_DIR);
}

/**
 * A browser with the unpacked extension loaded, the way Chrome loads it from
 * chrome://extensions. A persistent context is required: extensions do not load
 * into an ordinary one.
 *
 * Uses the signed-in profile when there is one, a throwaway profile otherwise —
 * so everything still runs anonymously, which is enough for a public project
 * except for per-user preferences. Only one script at a time: Chromium locks the
 * profile directory.
 */
export function launchWithExtension({ headless = true, withExtension = true } = {}) {
    const dir = hasProfile() ? PROFILE_DIR : mkdtempSync(join(tmpdir(), 'bpmn-surf-'));
    const args = withExtension
        ? [`--disable-extensions-except=${REPO_ROOT}`, `--load-extension=${REPO_ROOT}`]
        : [];
    return chromium.launchPersistentContext(dir, { channel: 'chromium', headless, args });
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
