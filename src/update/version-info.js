'use strict';

// Pure version and changelog logic for the update mechanism (FEAT-0012).
// No DOM/network/chrome.* — reused by the service worker and the popup,
// covered by unit tests (test/update/version-info.test.js).
class VersionInfo {
    // Normalizes a version string to an array of numbers: 'v0.18.0', '[0.18.0]', '0.18'
    // → [0, 18, 0]. Non-numeric parts → 0. Empty/invalid → [].
    static parse(version) {
        if (typeof version !== 'string') {
            return [];
        }
        const cleaned = version.trim().replace(/^v/i, '').replace(/^\[|\]$/g, '');
        if (cleaned === '') {
            return [];
        }
        return cleaned.split('.').map(part => {
            const n = parseInt(part, 10);
            return Number.isFinite(n) ? n : 0;
        });
    }

    // Numeric version comparison (not lexical — otherwise '0.9' > '0.18').
    // Returns -1 / 0 / 1. Missing parts are treated as 0 ('1.2' == '1.2.0').
    static compare(a, b) {
        const pa = VersionInfo.parse(a);
        const pb = VersionInfo.parse(b);
        const len = Math.max(pa.length, pb.length);
        for (let i = 0; i < len; i++) {
            const da = pa[i] || 0;
            const db = pb[i] || 0;
            if (da > db) return 1;
            if (da < db) return -1;
        }
        return 0;
    }

    // true if latest is strictly newer than current.
    static isNewer(current, latest) {
        if (VersionInfo.parse(latest).length === 0) {
            return false;
        }
        return VersionInfo.compare(latest, current) > 0;
    }

    // Parses CHANGELOG.md into entries [{version, body}] in file order
    // (newest on top). An entry = the '## <version>' heading + text up to the next
    // '#'/'##' level heading. version is normalized (no 'v'/brackets).
    static parseChangelog(markdown) {
        if (typeof markdown !== 'string') {
            return [];
        }
        const lines = markdown.split(/\r?\n/);
        const entries = [];
        let current = null;
        for (const line of lines) {
            const match = /^##\s+(.+?)\s*$/.exec(line);
            if (match && !line.startsWith('###')) {
                const version = match[1].trim().replace(/^v/i, '').replace(/^\[|\]$/g, '');
                current = { version, body: [] };
                entries.push(current);
            } else if (line.startsWith('# ')) {
                // A top-level heading (the file title) closes the current section.
                current = null;
            } else if (current) {
                current.body.push(line);
            }
        }
        return entries.map(e => ({ version: e.version, body: e.body.join('\n').trim() }));
    }

    // Changelog entries strictly newer than the installed version (order is preserved —
    // newest on top). Used for the "What's new" block.
    static changesSince(markdown, currentVersion) {
        return VersionInfo.parseChangelog(markdown)
            .filter(entry => VersionInfo.isNewer(currentVersion, entry.version));
    }
}
