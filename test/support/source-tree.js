'use strict';

// Helpers for the structural tests under test/structure/.
// These tests guard project-wide invariants that are otherwise protected only
// by prose in docs/ and developer discipline: the four path registries kept in
// sync by hand (manifest content_scripts / web_accessible_resources,
// utils.js#loadScripts, scope.js#SCOPE_FILES), the mirror test layout, the
// cross-scope message ids and unique basenames.
//
// Everything here reads the real project files; nothing is executed.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

function read(relPath) {
    return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function exists(relPath) {
    return fs.existsSync(path.join(ROOT, relPath));
}

// Recursively lists files under a repo-relative dir, returning repo-relative
// POSIX paths. Optionally filtered by extension (e.g. '.js').
function listFiles(relDir, ext = null) {
    const out = [];
    const absDir = path.join(ROOT, relDir);
    if (!fs.existsSync(absDir)) {
        return out;
    }
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
        const rel = path.posix.join(relDir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listFiles(rel, ext));
        } else if (!ext || entry.name.endsWith(ext)) {
            out.push(rel);
        }
    }
    return out;
}

// All shipped source files (POSIX, repo-relative), sorted.
function listSrcJsFiles() {
    return listFiles('src', '.js').sort();
}

// manifest.json content_scripts[].js and web_accessible_resources[].resources,
// each flattened into an ordered array.
function manifestRegistries() {
    const manifest = JSON.parse(read('manifest.json'));
    const contentScripts = (manifest.content_scripts || [])
        .flatMap(cs => cs.js || []);
    const webAccessibleResources = (manifest.web_accessible_resources || [])
        .flatMap(war => war.resources || []);
    return { contentScripts, webAccessibleResources };
}

// Ordered list of resources loaded by utils.js#loadScripts (addScript +
// addStylesheet calls), in source order.
function loadScriptsRegistry() {
    const src = read('src/core/utils.js');
    const body = src.slice(src.indexOf('async function loadScripts('));
    const matches = [...body.matchAll(/add(?:Script|Stylesheet)\('([^']+)'/g)];
    return matches.map(m => m[1]);
}

// The SCOPE_FILES array declared in test/support/scope.js, in order.
function scopeFilesRegistry() {
    const src = read('test/support/scope.js');
    const start = src.indexOf('const SCOPE_FILES = [');
    const end = src.indexOf('];', start);
    const block = src.slice(start, end);
    return [...block.matchAll(/'([^']+)'/g)].map(m => m[1]);
}

// Extracts a single-quoted string assigned to `name` (e.g. a static field or
// object property) from a source file. Returns the literal or null.
function extractStringLiteral(relPath, name) {
    const src = read(relPath);
    const re = new RegExp(`${name}\\s*[:=]\\s*'([^']+)'`);
    const m = src.match(re);
    return m ? m[1] : null;
}

module.exports = {
    ROOT,
    read,
    exists,
    listFiles,
    listSrcJsFiles,
    manifestRegistries,
    loadScriptsRegistry,
    scopeFilesRegistry,
    extractStringLiteral
};
