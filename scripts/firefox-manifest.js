// The addons.mozilla.org manifest, derived from the tracked (Chrome) manifest.json
// so that one stays the single source. Usage (scripts/package.sh --firefox):
//     node scripts/firefox-manifest.js <staged manifest.json>
// Firefox has no MV3 service worker: it runs the background as an event page,
// which has no importScripts, so the files the worker imports are listed ahead of
// it. Signing needs a gecko id (permanent: Firefox finds updates by it) and the
// data-collection declaration; AMO caps the name at 45 characters. Firefox 128
// brought optional_host_permissions; 140 is the first with the built-in
// data-collection consent.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const GECKO_ID = 'bpmn-surf@kaoalllex';
const NAME = 'bpmn-surf — BPMN/DMN diff for GitLab & GitHub';

function workerImports(workerPath) {
    const source = fs.readFileSync(path.join(REPO_ROOT, workerPath), 'utf8');
    const imports = [...source.matchAll(/importScripts\('\/?([^']+)'\)/g)].map(match => match[1]);
    // An import written another way would silently drop out of Firefox's background.
    if (!imports.length) {
        throw new Error(`no importScripts('<file>') found in ${workerPath}`);
    }
    return imports;
}

function toFirefoxManifest(manifest) {
    const worker = manifest.background.service_worker;
    return {
        ...manifest,
        name: NAME,
        background: { scripts: [...workerImports(worker), worker] },
        browser_specific_settings: {
            gecko: {
                id: GECKO_ID,
                strict_min_version: '140.0',
                data_collection_permissions: { required: ['none'] }
            }
        }
    };
}

if (require.main === module) {
    const file = process.argv[2];
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify(toFirefoxManifest(manifest), null, 4));
}

module.exports = { toFirefoxManifest };
