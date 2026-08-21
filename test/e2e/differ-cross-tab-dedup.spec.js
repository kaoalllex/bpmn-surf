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

async function diveInOnDiver(context) {
    const diver = await context.newPage();
    wireDiagnostics(diver);
    await bootBpmnDiffer(diver, { params: defaultBpmnParams(), fixtures: DIVER_FIXTURES });
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
test('does not match a closed tab (no stale registry entry)', async ({ context }) => {
    const callee = await bootCalleeTab(context);
    await callee.close(); // pagehide closes its registry channel

    const diver = await diveInOnDiver(context);

    await expect.poll(async () => (await getOpenDifferCalls(diver)).length).toBe(1);
    expect((await getOpenDifferCalls(diver))[0].params.filePath).toBe(CALLED_PATH);
});
