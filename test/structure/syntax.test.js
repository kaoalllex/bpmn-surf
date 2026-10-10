'use strict';

// Every shipped script must parse. The vm harness only executes the files in
// SCOPE_FILES, so a syntax error in an orchestrator or entrypoint
// (bpmn-differ.js, dmn-differ.js, app.js, main.js, ...) would otherwise leave
// the suite green and surface only in the browser. Compiling is enough —
// nothing is run.

const { describe, it } = require('node:test');
const vm = require('node:vm');
const { read, listSrcJsFiles } = require('../support/source-tree.js');

describe('syntax: every src/ script parses', () => {
    for (const file of listSrcJsFiles()) {
        it(`${file} parses`, () => {
            new vm.Script(read(file), { filename: file });
        });
    }
});
