'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('./support/scope.js');

const { FileTypeDetector, FILE_TYPE_BPMN, FILE_TYPE_DMN } = createScope();

describe('FileTypeDetector.detect', () => {
    const detector = new FileTypeDetector();

    it('detects .bpmn files', () => {
        assert.equal(detector.detect('dir/process.bpmn'), FILE_TYPE_BPMN);
    });

    it('detects .dmn files', () => {
        assert.equal(detector.detect('dir/decision.dmn'), FILE_TYPE_DMN);
    });

    it('returns null for other extensions', () => {
        assert.equal(detector.detect('readme.md'), null);
    });

    it('returns null for empty path', () => {
        assert.equal(detector.detect(''), null);
        assert.equal(detector.detect(null), null);
    });
});
