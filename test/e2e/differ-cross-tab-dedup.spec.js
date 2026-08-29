'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, CALL_ACTIVITY_BPMN
} = require('./support/boot-differ');
const {
    installCapture, getOpenDifferCalls, getOpenCalls
} = require('./support/dive-out-capture');

// The Call Activity resolves to this path; a sibling tab showing the same file is the
// duplicate BUG-0017 prevents. The fake's searchCode ignores the term, so the hit
// fully controls the resolved file.
const CALLED_PATH = 'processes/sub-process.bpmn';
const CALLED_HIT = { path: CALLED_PATH, line: 1, snippet: '<bpmn:process id="Sub_Process">' };
const DIVER_FIXTURES = { xmlByRef: { 'mr-sha': CALL_ACTIVITY_BPMN, 'base-sha': CALL_ACTIVITY_BPMN }, searchHits: [CALLED_HIT] };

// identityKeyFor(defaultBpmnParams, CALLED_PATH): refs joined with the file path,
// then the mode — an edit tab must not be deduplicated against the view tab of the
// same diagram (FEAT-0031), so 'view' is part of every view-mode tab's key.
const IDENTITY_KEY = ['http://localhost/p', '', 'mr-sha', 'base-sha', CALLED_PATH, 'view'].join('\n');
const TAB_NAME = 'gl-bpmn-diff-tab:' + IDENTITY_KEY;

// The key an EDIT tab for the DEFAULT diagram publishes: the same refs and path as a
// view tab of it, plus the edited side and the 'edit' suffix.
const EDIT_TAB_NAME = 'gl-bpmn-diff-tab:'
    + ['http://localhost/p', '', 'mr-sha', 'base-sha', 'diagram.bpmn', 'source', 'edit'].join('\n');

async function bootCalleeTab(context) {
    const callee = await context.newPage();
    wireDiagnostics(callee);
    // Same platform/refs as the diver, different file path -> same identity key the
    // diver computes for its dive target. Content is irrelevant; only the registry
    // name matters, so reuse the default fixtures.
    await bootBpmnDiffer(callee, {
        params: defaultBpmnParams({ filePath: CALLED_PATH, fileName: 'sub-process.bpmn' })
    });
    return callee;
}

async function diveInOnDiver(context, params = defaultBpmnParams()) {
    const diver = await context.newPage();
    wireDiagnostics(diver);
    await bootBpmnDiffer(diver, { params, fixtures: DIVER_FIXTURES });
    await installCapture(diver);
    await diver.locator('svg .djs-element[data-element-id="CallActivity_1"]').click();
    await diver.locator('.djs-overlay-note .dive-in-call-activity').click();
    return diver;
}

// K1: a tab already shows the called diagram, so diving into it brings that tab to
// the front (focus by its stable name) instead of opening a duplicate.
test('reuses an open tab for the same diagram instead of opening a duplicate', async ({ context }) => {
    await bootCalleeTab(context);
    const diver = await diveInOnDiver(context);

    // The "who-has" answer arrives ~instantly -> focus-by-name, not openDiffer.
    await expect.poll(() => getOpenCalls(diver)).toContainEqual(['', TAB_NAME]);
    expect(await getOpenDifferCalls(diver)).toEqual([]);
});

// K2 (non-vacuous control): with NO sibling tab, the same dive-in opens a fresh
// differ (the registry query times out with no answer).
test('opens a fresh differ when no tab shows the diagram', async ({ context }) => {
    const diver = await diveInOnDiver(context);

    await expect.poll(async () => (await getOpenDifferCalls(diver)).length).toBe(1);
    const [call] = await getOpenDifferCalls(diver);
    expect(call.params.filePath).toBe(CALLED_PATH);
    expect(await getOpenCalls(diver)).not.toContainEqual(['', TAB_NAME]); // no focus-by-name
});

// K3: a CLOSED tab leaves no stale registry entry, so it is never matched — diving
// into the diagram it used to show opens a fresh differ.
//
// What this proves is the END STATE, not the mechanism: closing the tab tears its
// BroadcastChannel down with the document, so the registry falls silent whether or not
// the pagehide listener ran. Mutating 'pagehide' in DifferTabNavigator#registerTab kills
// nothing here, and no e2e test can tell the two apart from outside (REFAC-0015 §4). The
// listener is belt-and-braces for the cases the browser does NOT tear the document down
// on — bfcache, in particular, where the channel would otherwise keep answering for a
// tab the user has navigated away from.
test('does not match a closed tab (no stale registry entry)', async ({ context }) => {
    const callee = await bootCalleeTab(context);
    await callee.close();

    const diver = await diveInOnDiver(context);

    await expect.poll(async () => (await getOpenDifferCalls(diver)).length).toBe(1);
    expect((await getOpenDifferCalls(diver))[0].params.filePath).toBe(CALLED_PATH);
});

// E1: the mode suffix at work (FEAT-0031). A sibling tab already VIEWS this very
// diagram — same platform, refs and file path — so its key differs from the edit key
// only by the suffix. Pressing ✎ must not be deduplicated against it: an editor and a
// viewer of the same diagram are different tabs, and a fresh edit differ is opened.
test('does not deduplicate an edit tab against a view tab of the same diagram', async ({ context }) => {
    const viewer = await context.newPage();
    wireDiagnostics(viewer);
    await bootBpmnDiffer(viewer, { params: defaultBpmnParams() });

    const editor = await context.newPage();
    wireDiagnostics(editor);
    await bootBpmnDiffer(editor, { params: defaultBpmnParams() });
    await installCapture(editor);

    await editor.getByTitle('Edit this diagram in a new tab').click();

    await expect.poll(async () => (await getOpenDifferCalls(editor)).length).toBe(1);
    const [call] = await getOpenDifferCalls(editor);
    expect(call.params.mode).toBe('edit');
    expect(call.params.editSide).toBe('source');
    // No tab was focused by name: the viewer's key ends with 'view', the queried one
    // with '…source\nedit', so the registry answered nothing.
    expect(await getOpenCalls(editor)).toEqual([]);
});

// E2 ([REFAC-0013], folded into §3): K1 taken FROM AN EDIT TAB. The tab it opens is a
// view tab — toNestedDifferParams() drops mode/editSide — so the key it looks up must
// come from those nested params. Computed from the editor's OWN params it would end
// with 'edit' and match nothing, and every dive-in from an editor would open a
// duplicate. No mutant expresses this (the defect is a variable swap), hence the case.
test('an edit tab reuses the open view tab of the diagram it dives into', async ({ context }) => {
    await bootCalleeTab(context);
    const diver = await diveInOnDiver(
        context, defaultBpmnParams({ mode: 'edit', editSide: 'source' }));

    await expect.poll(() => getOpenCalls(diver)).toContainEqual(['', TAB_NAME]);
    expect(await getOpenDifferCalls(diver)).toEqual([]);
});

// E3 (§3a, K1 mirrored into edit mode): the editor for this diagram is already open, so
// a second ✎ press focuses it rather than starting a second session over the same
// baseline — where the two would diverge and only one could be downloaded.
test('a second edit press focuses the editor already open', async ({ context }) => {
    const editor = await context.newPage();
    wireDiagnostics(editor);
    await bootBpmnDiffer(editor, {
        params: defaultBpmnParams({ mode: 'edit', editSide: 'source' })
    });

    const viewer = await context.newPage();
    wireDiagnostics(viewer);
    await bootBpmnDiffer(viewer, { params: defaultBpmnParams() });
    await installCapture(viewer);

    await viewer.getByTitle('Edit this diagram in a new tab').click();

    await expect.poll(() => getOpenCalls(viewer)).toContainEqual(['', EDIT_TAB_NAME]);
    expect(await getOpenDifferCalls(viewer)).toEqual([]);
});
