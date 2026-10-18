'use strict';

// The AMO build's manifest (scripts/package.sh --firefox): what Firefox and AMO
// signing need on top of the tracked manifest, and nothing else changed.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { read, exists } = require('../support/source-tree.js');
const { toFirefoxManifest } = require('../../scripts/firefox-manifest.js');

describe('Firefox manifest', () => {
    const manifest = JSON.parse(read('manifest.json'));
    const firefox = toFirefoxManifest(manifest);

    it('runs the worker as an event page, after every file it imports', () => {
        const worker = manifest.background.service_worker;
        assert.deepEqual(firefox.background, { scripts: ['src/hosts/host-patterns.js', worker] });
        for (const script of firefox.background.scripts) {
            assert.ok(exists(script), `${script} is missing`);
        }
    });

    it('carries what AMO signing requires', () => {
        const { gecko } = firefox.browser_specific_settings;
        assert.equal(gecko.id, 'bpmn-surf@kaoalllex');
        assert.deepEqual(gecko.data_collection_permissions, { required: ['none'] });
        // optional_host_permissions, the only way a site is turned on, came in Firefox 128
        assert.ok(parseFloat(gecko.strict_min_version) >= 128, gecko.strict_min_version);
    });

    it('keeps the name within AMO\'s 45 characters', () => {
        assert.ok(firefox.name.length <= 45, `${firefox.name.length}: ${firefox.name}`);
    });

    it('leaves every other key as the tracked manifest has it', () => {
        const changed = ['name', 'background', 'browser_specific_settings'];
        const rest = (m) => Object.fromEntries(Object.entries(m).filter(([key]) => !changed.includes(key)));
        assert.deepEqual(rest(firefox), rest(manifest));
        assert.equal(manifest.browser_specific_settings, undefined, 'the tracked manifest gained a Firefox key');
    });
});
