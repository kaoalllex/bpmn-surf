'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

// App is driven through stub providers, so the MR flow can be timed — the URL
// changing while the refs are still being resolved — without GitLab or chrome.*.

function deferred() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
}

// Lets the chain of awaits inside App run to its next pause.
async function settle() {
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 0));
    }
}

const MR_URL = 'https://gitlab.example.com/g/p/-/merge_requests/1/diffs';

function setup({ targetFilePath = async p => p } = {}) {
    const scope = createScope({ url: MR_URL });
    const w = scope.window;
    w.chrome = {
        runtime: { id: 'test', getManifest: () => ({ version: '0.0.0' }), getURL: p => 'chrome-extension://test/' + p },
        storage: { sync: { get: async () => ({}) } }
    };
    w.fetch = async () => ({ status: 200, ok: true, text: async () => '{}' });
    w.alert = () => {};
    const opened = [];
    w.openDiffer = params => { opened.push(params); };
    const errors = [];
    w.console.error = (...args) => errors.push(args.join(' '));

    // Each resolution of the source commit waits until the test answers it.
    const sourceCommits = [];
    const repo = {
        isAvailable: () => true,
        init: async () => true,
        isChangeViewActive: async () => true,
        initChangeInfo: async () => {},
        getSourceCommitId: () => {
            const d = deferred();
            sourceCommits.push(d);
            return d.promise;
        },
        getChangeInfo: () => ({ title: 'mr', iid: 1 }),
        getChangeBranchNames: () => ({ sourceBranchName: 'feat', targetBranchName: 'main' }),
        getTargetCommitId: async () => 'base',
        getDiffSideLabels: async () => ({ sourceLabel: 'feat', targetLabel: 'main' }),
        getProjectInfo: () => ({ url: 'https://gitlab.example.com/g/p', hostUrl: 'https://gitlab.example.com', groupName: 'g', name: 'p', id: 1 }),
        getTargetFilePath: targetFilePath,
        getBranchFileType: async () => null,
        extractBranchCommitIdAndFilePath: () => null
    };
    const syncs = [];
    const ui = {
        isOwnButtonClick: () => false,
        reset() {},
        removeFileButtons() {},
        isButtonPresent: () => false,
        buttonFilePath: () => null,
        syncFileButtons: describeFile => syncs.push(describeFile)
    };
    const app = new scope.App(repo, ui);
    return { scope, app, sourceCommits, syncs, opened, errors };
}

describe('App — MR change view', () => {
    it('builds no buttons from refs resolved for a URL the page has since left', async () => {
        const { scope, app, sourceCommits, syncs, opened } = setup();
        app.init();
        await settle();
        assert.equal(sourceCommits.length, 1);

        // A commit is picked while the refs of the whole MR are still loading.
        scope.window.history.pushState({}, '', MR_URL + '?commit_id=abc');
        sourceCommits[0].resolve('head');
        await settle();

        assert.equal(syncs.length, 0, 'no buttons carrying refs of the view that was left');
        assert.equal(sourceCommits.length, 2, 'the refs are resolved again for the new URL');

        sourceCommits[1].resolve('abc');
        await settle();
        assert.equal(syncs.length, 1);
        await syncs[0]('a.bpmn').onButtonClickFunc();
        assert.equal(opened.length, 1);
        assert.equal(opened[0].sourceRef, 'abc');
    });

    it('does not open the diff of a view the URL has left', async () => {
        const { scope, app, sourceCommits, syncs, opened } = setup();
        app.init();
        await settle();
        sourceCommits[0].resolve('head');
        await settle();
        const button = syncs[0]('a.bpmn');

        // An in-page URL change with no DOM change: nothing has rebuilt the buttons yet.
        scope.window.history.pushState({}, '', MR_URL + '?commit_id=abc');
        await button.onButtonClickFunc();

        assert.equal(opened.length, 0);
    });

    it('logs a click that fails instead of dropping it silently', async () => {
        const { app, sourceCommits, syncs, opened, errors } = setup({
            targetFilePath: async () => { throw new Error('changes API down'); }
        });
        app.init();
        await settle();
        sourceCommits[0].resolve('head');
        await settle();

        await assert.doesNotReject(syncs[0]('a.bpmn').onButtonClickFunc());
        assert.equal(opened.length, 0);
        assert.ok(errors.some(e => e.includes('changes API down')), errors.join('\n'));
    });
});
