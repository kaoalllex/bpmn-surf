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
 * The hosts the user added: the granted origins minus the ones the manifest
 * declares itself (gitlab.com stays declarative — its scripts are injected by
 * Chrome, registering them again would run everything twice).
 * @param {string[]} origins granted origins, from chrome.permissions.getAll()
 * @param {string[]} declaredMatches manifest content_scripts[0].matches
 * @returns {string[]} deduped and sorted
 */
function userOriginsFrom(origins, declaredMatches) {
    const declared = new Set(declaredMatches || []);
    const user = (origins || []).filter(o => HOST_ORIGIN_PATTERN.test(o) && !declared.has(o));
    return [...new Set(user)].sort();
}
