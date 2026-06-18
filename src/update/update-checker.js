'use strict';

// Network part of the update check (FEAT-0012): fetches version.json and (if a
// newer one exists) CHANGELOG.md, computes the result via VersionInfo. No chrome.*
// and no state writes — that is done by the service worker. Fetchers are injected
// (DI) → the class is unit-tested without a real network (test/update/update-checker.test.js).
//
// By design: data is only read (GET), nothing is sent,
// credentials:'omit' — no cookies (transparency/trust).
class UpdateChecker {
    constructor({ fetchJson, fetchText } = {}) {
        this._fetchJson = fetchJson || UpdateChecker.defaultFetchJson;
        this._fetchText = fetchText || UpdateChecker.defaultFetchText;
    }

    static defaultFetchJson(url) {
        return fetch(url, { credentials: 'omit', cache: 'no-store' })
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            });
    }

    static defaultFetchText(url) {
        return fetch(url, { credentials: 'omit', cache: 'no-store' })
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.text();
            });
    }

    // Returns the check result:
    //   { configured, latestVersion, downloadUrl, updateAvailable, changes, error }
    // configured:false — version source is not configured (empty URL) → no-op.
    // error — string on a network/parse error (updateAvailable=false).
    async check({ manifestUrl, changelogUrl, currentVersion }) {
        if (!manifestUrl) {
            return { configured: false, updateAvailable: false, changes: [] };
        }
        try {
            const manifest = await this._fetchJson(manifestUrl);
            const latestVersion = (manifest && manifest.version) || '';
            const updateAvailable = VersionInfo.isNewer(currentVersion, latestVersion);

            let changes = [];
            const notesUrl = changelogUrl || (manifest && manifest.changelogUrl) || '';
            if (updateAvailable && notesUrl) {
                try {
                    const markdown = await this._fetchText(notesUrl);
                    changes = VersionInfo.changesSince(markdown, currentVersion);
                } catch (e) {
                    // Notes are optional: we still show the update without them.
                    changes = [];
                }
            }

            return {
                configured: true,
                latestVersion,
                downloadUrl: (manifest && manifest.downloadUrl) || '',
                updateAvailable,
                changes
            };
        } catch (e) {
            return {
                configured: true,
                updateAvailable: false,
                changes: [],
                error: String((e && e.message) || e)
            };
        }
    }
}
