'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { DifferParams } = createScope();

const validParams = {
    platform: { kind: 'gitlab', projectUrl: 'https://gitlab.example.com/group/project' },
    sourceRef: 'abc123',
    sourceLabel: 'feature/x',
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

    it('keeps an explicit targetLabel separate from targetRef', () => {
        const merged = { ...validParams, targetRef: 'deadbeef', targetLabel: 'master' };
        const p = new DifferParams(merged);
        assert.equal(p.targetRef, 'deadbeef');
        assert.equal(p.targetLabel, 'master');
    });

    it('falls back targetLabel to targetRef when not provided', () => {
        const p = new DifferParams(validParams);
        assert.equal(p.targetLabel, 'master');
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

    // The raw/blob URL builders moved to PlatformClient (REFAC-0004); their
    // construction is now covered by gitlab-platform-client.test.js.

    it('targetFilePath defaults to filePath when not provided', () => {
        const p = new DifferParams(validParams);
        assert.equal(p.targetFilePath, 'src/process.bpmn');
    });

    it('keeps an explicit targetFilePath (renamed file)', () => {
        const p = new DifferParams({ ...validParams, targetFilePath: 'src/old-name.bpmn' });
        assert.equal(p.targetFilePath, 'src/old-name.bpmn');
        assert.equal(p.filePath, 'src/process.bpmn');
    });

    it('targetFileName defaults to fileName when there is no rename', () => {
        const p = new DifferParams(validParams);
        assert.equal(p.targetFileName, 'process.bpmn');
    });

    it('targetFileName is the basename of targetFilePath when renamed', () => {
        const p = new DifferParams({ ...validParams, targetFilePath: 'a/b/old-name.bpmn' });
        assert.equal(p.targetFileName, 'old-name.bpmn');
        assert.equal(p.fileName, 'process.bpmn');
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
        const p = new DifferParams({ ...validParams, targetRef: 'deadbeef', targetLabel: 'master' });
        const nested = p.toNestedDifferParams('src/sub.bpmn', 'sub.bpmn');

        assert.equal(nested.platform, p.platform);
        assert.equal(nested.sourceRef, 'abc123');
        assert.equal(nested.targetRef, 'deadbeef');
        assert.equal(nested.targetLabel, 'master');
        assert.equal(nested.sourceLabel, 'feature/x');
        assert.equal(nested.filePath, 'src/sub.bpmn');
        assert.equal(nested.fileName, 'sub.bpmn');
    });

    // FEAT-0023 follow-up: identityKey is the dedup key used to find an already-open
    // tab showing the same diagram before opening a duplicate nested differ.
    describe('identityKey', () => {
        it('is identical for two params describing the same diagram diff', () => {
            const a = new DifferParams(validParams);
            const b = new DifferParams({ ...validParams });
            assert.equal(a.identityKey(), b.identityKey());
        });

        it('differs when the file path differs', () => {
            const a = new DifferParams(validParams);
            const b = new DifferParams({ ...validParams, filePath: 'src/other.bpmn' });
            assert.notEqual(a.identityKey(), b.identityKey());
        });

        it('differs for the same file in a different MR (changeRequestId)', () => {
            const a = new DifferParams({ ...validParams, changeRequestId: '10' });
            const b = new DifferParams({ ...validParams, changeRequestId: '20' });
            assert.notEqual(a.identityKey(), b.identityKey());
        });

        it('differs for the same file at different source/target refs', () => {
            const a = new DifferParams(validParams);
            const bySource = new DifferParams({ ...validParams, sourceRef: 'zzz999' });
            const byTarget = new DifferParams({ ...validParams, targetRef: 'release' });
            assert.notEqual(a.identityKey(), bySource.identityKey());
            assert.notEqual(a.identityKey(), byTarget.identityKey());
        });

        it('matches the key a nested differ for the same file will publish', () => {
            // A tab dives into src/sub.bpmn: the key it computes for the target must
            // equal the key the freshly opened nested tab publishes from its params.
            const parent = new DifferParams(validParams);
            const targetKey = DifferParams.identityKeyFor(parent, 'src/sub.bpmn');

            const nestedRaw = parent.toNestedDifferParams('src/sub.bpmn', 'sub.bpmn');
            const nested = new DifferParams(nestedRaw);
            assert.equal(nested.identityKey(), targetKey);
        });

        it('a dive-in target key from an edit-mode parent is a VIEW key', () => {
            // An edit-mode tab's OWN identityKey() carries mode/editSide, but the tab
            // it dives into is a view tab (toNestedDifferParams drops mode). So the
            // key used to open/focus the dive-in target must be computed from the
            // NESTED params — BpmnDiffer#openDifferForFile. Deriving both sides from
            // nestedRaw would hold for any input, so the parent's key is the other
            // side: it must NOT equal the child's (REFAC-0015 §3).
            const parent = new DifferParams({ ...validParams, mode: 'edit', editSide: 'target' });
            const nestedRaw = parent.toNestedDifferParams('src/sub.bpmn', 'sub.bpmn');

            const childKey = new DifferParams(nestedRaw).identityKey();
            assert.equal(childKey, DifferParams.identityKeyFor(nestedRaw, 'src/sub.bpmn'));
            assert.ok(childKey.endsWith('\nview'));
            assert.notEqual(DifferParams.identityKeyFor(parent, 'src/sub.bpmn'), childKey);
        });
    });

    it('defaults mode to view and editSide to null', () => {
        const p = new DifferParams(validParams);
        assert.equal(p.mode, 'view');
        assert.equal(p.editSide, null);
    });

    it('accepts edit mode with a side', () => {
        const p = new DifferParams({ ...validParams, mode: 'edit', editSide: 'target' });
        assert.equal(p.mode, 'edit');
        assert.equal(p.editSide, 'target');
    });

    it('rejects an unknown mode', () => {
        assert.throws(() => new DifferParams({ ...validParams, mode: 'nonsense' }), /mode/);
    });

    it('appends a mode suffix to the view identity key', () => {
        // The dive-in path precomputes the key the TARGET tab will publish, so the
        // view-mode key must stay stable across this change (BUG-0017).
        const p = new DifferParams(validParams);
        assert.equal(
            p.identityKey(),
            [validParams.platform.projectUrl, '', 'abc123', 'master', 'src/process.bpmn', 'view'].join('\n'));
    });

    it('gives the edit tab a different identity key than the view tab', () => {
        const p = new DifferParams(validParams);
        assert.notEqual(p.editIdentityKey('target'), p.identityKey());
        assert.ok(p.editIdentityKey('target').endsWith('edit'));
    });

    it('gives each edited side its own identity key', () => {
        const p = new DifferParams(validParams);
        assert.notEqual(p.editIdentityKey('target'), p.editIdentityKey('source'));
    });

    it('carries the rename and local-file fields into the edit params', () => {
        // toNestedDifferParams drops these (it targets a DIFFERENT file); the edit
        // tab shows the SAME file, so losing them would load the wrong base path.
        const p = new DifferParams({
            ...validParams,
            targetFilePath: 'src/old-name.bpmn',
            targetLabel: 'master'
        });
        const edit = p.toEditDifferParams('target');
        assert.equal(edit.mode, 'edit');
        assert.equal(edit.editSide, 'target');
        assert.equal(edit.filePath, 'src/process.bpmn');
        assert.equal(edit.targetFilePath, 'src/old-name.bpmn');
        assert.equal(edit.targetLabel, 'master');
        assert.equal(edit.camundaBpmnModdle, p.camundaBpmnModdle);
    });

    it('carries localFileContent into the edit params', () => {
        const localParams = { ...validParams };
        delete localParams.sourceRef;
        const p = new DifferParams({ ...localParams, localFileContent: '<xml/>' });
        assert.equal(p.toEditDifferParams('source').localFileContent, '<xml/>');
    });
});

describe('DifferParams.extensionVersion (FEAT-0024)', () => {
    const params = new DifferParams({
        platform: { projectUrl: 'https://host/p' },
        targetRef: 'base-sha',
        filePath: 'a/process.bpmn',
        fileName: 'process.bpmn',
        extensionVersion: '1.2.0'
    });

    it('is exposed on the params', () => {
        assert.equal(params.extensionVersion, '1.2.0');
    });

    it('travels into nested and edit params, so a dived-into tab still reports it', () => {
        assert.equal(params.toNestedDifferParams('b/other.bpmn', 'other.bpmn').extensionVersion, '1.2.0');
        assert.equal(params.toEditDifferParams(DifferParams.EDIT_SIDE_SOURCE).extensionVersion, '1.2.0');
    });
});
