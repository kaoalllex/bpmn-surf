'use strict';

// Loads extension scripts the same way the differ page does (plain <script>
// tags sharing one global scope): each file is executed in a single jsdom
// vm context, in the same order as utils.js#loadScripts.
// Production files are not modified in any way.
//
// jsdom was verified to match Chrome on the XML APIs the comparators rely on:
// DOMParser('text/xml'), getElementsByTagName with 'bpmn:' prefixes,
// document.getElementById on XML docs, querySelectorAll('[id]'), outerHTML.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');

// Differ-page leaf files in utils.js#loadScripts relative order,
// plus content-script files under test (models.js, file-type-detector.js)
// that are not part of loadScripts.
// Do NOT add bpmn-differ.js / dmn-differ.js here: they self-execute main() on load.
const SCOPE_FILES = [
    'utils.js',
    'diff-type.js',
    'condition-formatter.js',
    'bpmn-xml-comparator.js',
    'properties-panel-highlighter.js',
    'differ-params.js',
    'call-activity-locator.js',
    'handler-locator.js',
    'dmn-xml-comparator.js',
    'dmn-diff-painter.js',
    // content-script files, in manifest.json#content_scripts relative order.
    // repo-provider.js / ui-repo-provider.js must precede the gitlab-* providers
    // that extend them (extends is evaluated at load time).
    'config.js',
    'models.js',
    'repo-provider.js',
    'ui-repo-provider.js',
    'single-entry-cache.js',
    'gitlab-url-parser.js',
    'gitlab-dom-scraper.js',
    'master-commit-manager.js',
    'merged-mr-commit-resolver.js',
    'gitlab-repo-provider-base.js',
    'gitlab-repo-provider.js',
    'gitlab-ui-repo-provider.js',
    'gitlab-api-repo-provider.js',
    'fallback-repo-provider.js',
    'repo-provider-factory.js',
    'file-type-detector.js',
    'diff-params-builder.js'
];

// Global names extracted from the loaded scope and returned by createScope().
// Add a name here (and its file above, if new) to make it available in tests.
const EXPORTED_NAMES = [
    'DiffType',
    'ConditionFormatter',
    'FileType', 'FILE_TYPE_BPMN', 'FILE_TYPE_DMN',
    'FileTypeDetector',
    'DifferParams',
    'DiffParamsBuilder',
    'CallActivityLocator',
    'ExternalTaskHandlerLocator',
    'BpmnXmlComparator',
    'PropertiesPanelHighlighter',
    'DmnXmlComparator',
    'DmnDiffPainter',
    'SingleEntryCache',
    'GitLabUrlParser',
    'GitLabDomScraper',
    'MergedMrCommitResolver',
    'GitLabRepoProviderBase',
    'GitLabRepoProvider',
    'GitLabUIRepoProvider', 'UI_BUTTON_TYPE',
    'GitLabApiRepoProvider',
    'FallbackRepoProvider',
    'createRepoProvider', 'createUIRepoProvider',
    // utils.js functions under test
    'parseXml',
    'getFileNameFromPath', 'getFileNameWithoutExtensionFromPath',
    'capitalizeFirstLetter', 'getTitle', 'requireDefined', 'doWithAttempts'
];

// Creates a fresh isolated scope per test file (or per test, if needed):
// returns { window, document, <all EXPORTED_NAMES> }.
function createScope({ url } = {}) {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        runScripts: 'outside-only',
        ...(url ? { url } : {})
    });
    const context = dom.getInternalVMContext();

    for (const file of SCOPE_FILES) {
        const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
        new vm.Script(code, { filename: file }).runInContext(context);
    }

    // Top-level class/const declarations are global lexical bindings, not
    // globalThis properties, so they must be read from inside the context.
    const exported = vm.runInContext(`({ ${EXPORTED_NAMES.join(', ')} })`, context);

    return { window: dom.window, document: dom.window.document, ...exported };
}

function fixture(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf8');
}

// Objects created inside the vm context have that realm's prototypes,
// so assert.deepEqual would fail on them. Convert before asserting:
// a realm Map<string, string[]> becomes a plain host object.
function mapToObject(map) {
    const obj = {};
    for (const [key, value] of map) {
        obj[key] = Array.from(value);
    }
    return obj;
}

module.exports = { createScope, fixture, mapToObject };
