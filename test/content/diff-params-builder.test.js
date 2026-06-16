'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { DiffParamsBuilder } = createScope();

const projectInfo = {
    url: 'https://gitlab.example.com/group/project',
    hostUrl: 'https://gitlab.example.com',
    id: 42
};

describe('DiffParamsBuilder.buildDiffParams', () => {
    const builder = new DiffParamsBuilder();
    const params = builder.buildDiffParams({
        projectInfo: projectInfo,
        sourceRef: 'mr-sha',
        sourceLabel: 'feature/x',
        targetRef: 'deadbeef',
        targetLabel: 'master',
        changeRequestId: '123',
        filePath: 'src/process.bpmn',
        fileName: 'process.bpmn',
        camundaBpmnModdle: { moddle: true }
    });

    it('groups platform-specific data under a discriminated platform descriptor', () => {
        assert.deepEqual({ ...params.platform }, {
            kind: 'gitlab',
            projectUrl: 'https://gitlab.example.com/group/project',
            hostUrl: 'https://gitlab.example.com',
            projectId: 42
        });
    });

    it('exposes neutral refs and change-request id flatly', () => {
        assert.equal(params.sourceRef, 'mr-sha');
        assert.equal(params.sourceLabel, 'feature/x');
        assert.equal(params.targetRef, 'deadbeef');
        assert.equal(params.targetLabel, 'master');
        assert.equal(params.changeRequestId, '123');
    });

    it('carries file info and moddle', () => {
        assert.equal(params.filePath, 'src/process.bpmn');
        assert.equal(params.fileName, 'process.bpmn');
        assert.deepEqual(params.camundaBpmnModdle, { moddle: true });
    });

    it('does not leak GitLab-specific field names onto the neutral surface', () => {
        for (const leaked of ['projectUrl', 'projectHostUrl', 'projectId', 'mrCommitId', 'mrBranchName', 'mrIid', 'branchCommitId']) {
            assert.ok(!(leaked in params), `unexpected flat field: ${leaked}`);
        }
    });
});

describe('DiffParamsBuilder.buildBranchParams', () => {
    const builder = new DiffParamsBuilder();
    const params = builder.buildBranchParams({
        projectInfo: projectInfo,
        targetRef: 'feature/y',
        filePath: 'src/process.bpmn',
        fileName: 'process.bpmn',
        camundaBpmnModdle: null
    });

    it('has no source side', () => {
        assert.equal(params.sourceRef, null);
        assert.equal(params.sourceLabel, null);
        assert.equal(params.changeRequestId, undefined);
    });

    it('still carries the platform descriptor and target ref', () => {
        assert.equal(params.platform.kind, 'gitlab');
        assert.equal(params.platform.projectId, 42);
        assert.equal(params.targetRef, 'feature/y');
    });

    it('falls back the displayed label to the ref (no MR target branch here)', () => {
        assert.equal(params.targetLabel, 'feature/y');
    });
});
