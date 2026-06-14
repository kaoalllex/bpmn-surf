'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('./support/scope.js');

const { DifferParams } = createScope();

const validParams = {
    platform: { kind: 'gitlab', projectUrl: 'https://gitlab.example.com/group/project' },
    sourceRef: 'abc123',
    sourceBranchName: 'feature/x',
    targetRef: 'master',
    filePath: 'src/process.bpmn',
    fileName: 'process.bpmn'
};

describe('DifferParams', () => {
    it('accepts valid params and maps fields', () => {
        const p = new DifferParams(validParams);
        assert.equal(p.platform.projectUrl, validParams.platform.projectUrl);
        assert.equal(p.sourceRef, 'abc123');
        assert.equal(p.targetRef, 'master');
        assert.equal(p.filePath, 'src/process.bpmn');
    });

    it('throws when a required param is missing', () => {
        for (const required of ['platform', 'targetRef', 'filePath', 'fileName']) {
            const params = { ...validParams };
            delete params[required];
            assert.throws(() => new DifferParams(params), new RegExp(`${required} is undefined`));
        }
    });

    it('throws when platform.projectUrl is missing', () => {
        const params = { ...validParams, platform: { kind: 'gitlab' } };
        assert.throws(() => new DifferParams(params), /platform.projectUrl is undefined/);
    });

    it('builds raw file url', () => {
        const p = new DifferParams(validParams);
        assert.equal(
            p.rawFileUrl('abc123'),
            'https://gitlab.example.com/group/project/-/raw/abc123/src/process.bpmn'
        );
    });

    it('isSourceVersionDefined is truthy with sourceRef or localFileContent and falsy without both', () => {
        assert.ok(new DifferParams(validParams).isSourceVersionDefined());

        const local = { ...validParams, sourceRef: undefined, localFileContent: '<xml/>' };
        assert.ok(new DifferParams(local).isSourceVersionDefined());

        const branchOnly = { ...validParams, sourceRef: undefined };
        assert.ok(!new DifferParams(branchOnly).isSourceVersionDefined());
    });

    it('requirePlatformInfo throws when host/id is missing and passes when present', () => {
        const p = new DifferParams(validParams);
        assert.throws(() => p.requirePlatformInfo(), /platform.hostUrl is undefined/);

        const withInfo = new DifferParams({
            ...validParams,
            platform: { ...validParams.platform, hostUrl: 'https://gitlab.example.com', projectId: 42 }
        });
        assert.doesNotThrow(() => withInfo.requirePlatformInfo());
    });

    it('toNestedDifferParams carries platform and refs but swaps the file', () => {
        const p = new DifferParams(validParams);
        const nested = p.toNestedDifferParams('src/sub.bpmn', 'sub.bpmn');

        assert.equal(nested.platform, p.platform);
        assert.equal(nested.sourceRef, 'abc123');
        assert.equal(nested.targetRef, 'master');
        assert.equal(nested.sourceBranchName, 'feature/x');
        assert.equal(nested.filePath, 'src/sub.bpmn');
        assert.equal(nested.fileName, 'sub.bpmn');
    });
});
