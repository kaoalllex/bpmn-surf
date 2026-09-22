'use strict';

// Unit tests for BpmnDiffer static data. The class itself is DOM/bpmn-js glue
// covered by the manual differ checklist (BUG-0011); the only pure, testable
// surface is the EDIT_EVENTS list that drives the edit-disabling veto.
//
// bpmn-differ.js is deliberately excluded from the shared #scope harness (it
// self-executes main() on load), so load it here into a dedicated vm context.
// main() only registers a window 'message' listener, which is harmless in jsdom.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..', '..');

function loadBpmnDiffer() {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        runScripts: 'outside-only'
    });
    const context = dom.getInternalVMContext();
    for (const file of [
        'src/core/utils.js', 'src/core/console-log.js', 'src/differ/bpmn/bpmn-differ.js'
    ]) {
        const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
        new vm.Script(code, { filename: file }).runInContext(context);
    }
    return vm.runInContext('BpmnDiffer', context);
}

const BpmnDiffer = loadBpmnDiffer();

describe('BpmnDiffer.EDIT_EVENTS', () => {
    it('lists every cancelable edit interaction the veto must disable', () => {
        // Guards against a line being accidentally dropped from the list: each
        // missing event re-enables an editing gesture on the read-only canvas.
        // Spread into a host-realm array: the vm-context array has that realm's
        // Array prototype, which deepStrictEqual rejects (see scope.js#mapToObject).
        assert.deepEqual([...BpmnDiffer.EDIT_EVENTS], [
            'shape.move.start', 'bendpoint.move.start', 'connectionSegment.move.start',
            'resize.start', 'connect.start', 'global-connect.start'
        ]);
    });
});
