'use strict';

// The postMessage ids that hand a diagram off from the content script to the
// differ page are duplicated across two script scopes that cannot share code
// (content scope has config.js, the differ page does not). App.MESSAGES.*
// (content) must equal BpmnDiffer/DmnDiffer.MSG_ID (differ page), or clicking
// the button opens a differ that silently ignores the message.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { extractStringLiteral } = require('../support/source-tree.js');

describe('message ids match across content and differ scopes', () => {
    const appBpmnId = extractStringLiteral('src/content/app.js', 'BPMN_ID');
    const appDmnId = extractStringLiteral('src/content/app.js', 'DMN_ID');
    const bpmnDifferId = extractStringLiteral('src/differ/bpmn/bpmn-differ.js', 'MSG_ID');
    const dmnDifferId = extractStringLiteral('src/differ/dmn/dmn-differ.js', 'MSG_ID');

    it('all four literals are present', () => {
        assert.ok(appBpmnId, 'App.MESSAGES.BPMN_ID not found in app.js');
        assert.ok(appDmnId, 'App.MESSAGES.DMN_ID not found in app.js');
        assert.ok(bpmnDifferId, 'BpmnDiffer.MSG_ID not found in bpmn-differ.js');
        assert.ok(dmnDifferId, 'DmnDiffer.MSG_ID not found in dmn-differ.js');
    });

    it('BPMN id matches between App and BpmnDiffer', () => {
        assert.equal(appBpmnId, bpmnDifferId);
    });

    it('DMN id matches between App and DmnDiffer', () => {
        assert.equal(appDmnId, dmnDifferId);
    });

    it('BPMN and DMN ids are distinct', () => {
        assert.notEqual(appBpmnId, appDmnId);
    });
});
