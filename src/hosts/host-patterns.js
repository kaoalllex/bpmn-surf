'use strict';

// Pure match-pattern logic for the user-configurable hosts (FEAT-0033).
// No DOM / network / chrome.* — shared by the service worker (which registers
// the content scripts for every granted origin) and the popup (which validates
// what the user types before asking Chrome for the permission).
// Covered by unit tests (test/hosts/host-patterns.test.js).

// One concrete https host: exactly what chrome.permissions.request takes and
// what a registered content script matches on. Anything broader is not ours.
const HOST_ORIGIN_PATTERN = /^https:\/\/[^*\/]+\/\*$/;

// A hostname of dot-separated labels (letters, digits, inner hyphens). Single
// label allowed — internal instances are often reachable as just `gitlab`.
const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

/**
 * Normalizes what the user typed into a single-origin match pattern, or null
 * when it is not a usable https host. Accepts a bare host, an origin, or any
 * pasted page URL (an MR link is the common case) — port and path are dropped.
 * @param {string} input
 * @returns {string|null} `https://<host>/*`
 */
function normalizeHostPattern(input) {
    const raw = String(input === null || input === undefined ? '' : input).trim();
    if (!raw || raw.includes('*')) {
        return null;
    }
    const withScheme = raw.includes('://') ? raw : `https://${raw}`;
    if (!withScheme.toLowerCase().startsWith('https://')) {
        return null;
    }
    let hostname;
    try {
        hostname = new URL(withScheme).hostname;
    } catch (e) {
        return null;
    }
    return HOSTNAME_PATTERN.test(hostname) ? `https://${hostname}/*` : null;
}

/**
 * The hosts the extension runs on. Every granted https host is a site the user
 * chose; nothing is built in.
 * @param {string[]} origins granted origins, from chrome.permissions.getAll()
 * @returns {string[]} deduped and sorted
 */
function userOriginsFrom(origins) {
    const user = (origins || []).filter(o => HOST_ORIGIN_PATTERN.test(o));
    return [...new Set(user)].sort();
}

const GITLAB_COM = 'https://gitlab.com/*';
const GITLAB_COM_NOTICE_KEY = 'gitlabComNotice';

// Up to 1.3.x gitlab.com was built into the manifest; since 1.4.0 every site is
// the user's choice. Whether Chrome keeps the old grant once the host is only
// optional is undocumented, so a user who lost it is told instead of finding
// the buttons gone.
function needsGitlabComNotice(previousVersion, origins) {
    const [major, minor] = String(previousVersion || '').split('.').map(Number);
    const fromBuiltInRelease = major === 1 && minor < 4;
    return fromBuiltInRelease && !(origins || []).includes(GITLAB_COM);
}
