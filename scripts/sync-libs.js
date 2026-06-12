// Copies the extension's runtime library files from node_modules into libs/.
// Usage: npm run sync:libs (after npm install). To upgrade a library:
// bump its version in package.json#devDependencies, npm install, npm run sync:libs.
// Every file listed here is referenced by manifest.json#web_accessible_resources
// and loaded in utils.js#loadScripts (camunda.json — in camunda-bpmn-moddle-manager.js).
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');
const NODE_MODULES_DIR = path.join(ROOT_DIR, 'node_modules');
const LIBS_DIR = path.join(ROOT_DIR, 'libs');

const LIBS = [
    {
        package: 'bpmn-js',
        from: 'dist',
        files: [
            'bpmn-modeler.production.min.js',
            'assets/bpmn-js.css',
            'assets/diagram-js.css',
            'assets/bpmn-font/css/bpmn.css',
            'assets/bpmn-font/css/bpmn-codes.css',
            'assets/bpmn-font/css/bpmn-embedded.css',
            'assets/bpmn-font/font/bpmn.eot',
            'assets/bpmn-font/font/bpmn.svg',
            'assets/bpmn-font/font/bpmn.ttf',
            'assets/bpmn-font/font/bpmn.woff',
            'assets/bpmn-font/font/bpmn.woff2'
        ]
    },
    {
        package: 'dmn-js',
        from: 'dist',
        files: [
            'dmn-viewer.development.js',
            'assets/diagram-js.css',
            'assets/dmn-js-decision-table-controls.css',
            'assets/dmn-js-decision-table.css',
            'assets/dmn-js-drd.css',
            'assets/dmn-js-literal-expression.css',
            'assets/dmn-js-shared.css',
            'assets/dmn-font/css/dmn.css',
            'assets/dmn-font/css/dmn-codes.css',
            'assets/dmn-font/css/dmn-embedded.css',
            'assets/dmn-font/font/dmn.eot',
            'assets/dmn-font/font/dmn.svg',
            'assets/dmn-font/font/dmn.ttf',
            'assets/dmn-font/font/dmn.woff',
            'assets/dmn-font/font/dmn.woff2'
        ]
    },
    {
        package: 'bpmn-js-properties-panel',
        from: 'dist',
        files: [
            'bpmn-js-properties-panel.umd.js'
        ]
    },
    // since bpmn-js-properties-panel 5.x its CSS lives in separate packages;
    // target paths are kept as before to avoid touching manifest.json/utils.js
    {
        package: '@bpmn-io/properties-panel',
        from: 'dist/assets',
        to: 'bpmn-js-properties-panel/assets',
        files: [
            'properties-panel.css'
        ]
    },
    {
        package: 'bpmn-js-element-templates',
        from: 'dist/assets',
        to: 'bpmn-js-properties-panel/assets',
        files: [
            'element-templates.css'
        ]
    },
    {
        package: 'camunda-bpmn-moddle',
        from: '',
        files: [
            'resources/camunda.json'
        ]
    }
];

function packageVersion(packageName) {
    const packageJsonPath = path.join(NODE_MODULES_DIR, packageName, 'package.json');
    return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version;
}

function syncLib(lib) {
    const sourceDir = path.join(NODE_MODULES_DIR, lib.package, lib.from);
    const targetDir = path.join(LIBS_DIR, lib.to ?? lib.package);

    for (const file of lib.files) {
        const sourceFile = path.join(sourceDir, file);
        if (!fs.existsSync(sourceFile)) {
            throw new Error(`Missing ${sourceFile} — did the package layout change?`);
        }
        const targetFile = path.join(targetDir, file);
        fs.mkdirSync(path.dirname(targetFile), { recursive: true });
        fs.copyFileSync(sourceFile, targetFile);
    }

    console.log(`${lib.package}@${packageVersion(lib.package)}: ${lib.files.length} files`);
}

const targetRoots = new Set(LIBS.map((lib) => (lib.to ?? lib.package).split('/')[0]));
for (const root of targetRoots) {
    fs.rmSync(path.join(LIBS_DIR, root), { recursive: true, force: true });
}
for (const lib of LIBS) {
    syncLib(lib);
}
console.log(`Synced into ${LIBS_DIR}`);
