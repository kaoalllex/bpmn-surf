'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('./support/scope.js');

const { DifferParams } = createScope();

const validParams = {
    projectUrl: 'https://gitlab.example.com/group/project',
    mrCommitId: 'abc123',
    mrBranchName: 'feature/x',
    branchCommitId: 'master',
    filePath: 'src/process.bpmn',
    fileName: 'process.bpmn'
};

describe('DifferParams', () => {
    it('accepts valid params and maps fields', () => {
        const p = new DifferParams(validParams);
        assert.equal(p.projectUrl, validParams.projectUrl);
        assert.equal(p.mrCommitId, 'abc123');
        assert.equal(p.targetBranchName, 'master');
        assert.equal(p.filePath, 'src/process.bpmn');
    });

    it('throws when a required param is missing', () => {
        for (const required of ['projectUrl', 'branchCommitId', 'filePath', 'fileName']) {
            const params = { ...validParams };
            delete params[required];
            assert.throws(() => new DifferParams(params), new RegExp(`${required} is undefined`));
        }
    });

    it('builds raw file url', () => {
        const p = new DifferParams(validParams);
        assert.equal(
            p.rawFileUrl('abc123'),
            'https://gitlab.example.com/group/project/-/raw/abc123/src/process.bpmn'
        );
    });

    it('isMrBranchDefined is truthy with mrCommitId or localFileContent and falsy without both', () => {
        assert.ok(new DifferParams(validParams).isMrBranchDefined());

        const local = { ...validParams, mrCommitId: undefined, localFileContent: '<xml/>' };
        assert.ok(new DifferParams(local).isMrBranchDefined());

        const branchOnly = { ...validParams, mrCommitId: undefined };
        assert.ok(!new DifferParams(branchOnly).isMrBranchDefined());
    });

    it('requireProjectInfo throws when project info is missing', () => {
        const p = new DifferParams(validParams);
        assert.throws(() => p.requireProjectInfo(), /projectHostUrl is undefined/);

        const withInfo = new DifferParams({ ...validParams, projectHostUrl: 'https://gitlab.example.com', projectId: 42 });
        assert.doesNotThrow(() => withInfo.requireProjectInfo());
    });
});
