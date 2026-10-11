'use strict';

// The tracked manifest is the store build (scripts/package.sh --store copies it and
// refuses extra hosts): it must declare no site. A required host would make Chrome
// disable the extension for every existing user until they accept the new
// permission; the sites are optional permissions the service worker registers
// content scripts for (docs/architecture.md, "No built-in sites").

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('../support/source-tree.js');

describe('manifest.json', () => {
    const manifest = JSON.parse(read('manifest.json'));

    it('declares no content_scripts', () => {
        assert.equal(manifest.content_scripts, undefined);
    });

    it('declares no host_permissions', () => {
        assert.equal(manifest.host_permissions, undefined);
    });
});
