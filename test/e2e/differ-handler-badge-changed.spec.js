'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, HANDLER_BADGES_BPMN
} = require('./support/boot-differ');

const GREEN = 'rgb(136, 255, 136)';   // added
const BLUE = 'rgb(136, 136, 255)';    // changed
const RED = 'rgb(255, 136, 136)';     // removed

// With a changeRequestId set, findChangedHandlers fetches each changed handler
// source file and parses its keys. A topic handler whose file is "added" → green;
// a class handler whose file is "changed" → blue; a delegate handler whose file is
// "removed" → red (scanned at the target ref). The matching diagram element gets a
// permanent badge coloured by the file's status, with a per-status title.
test('paints permanent changed-handler badges coloured by status', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ changeRequestId: 42 }),
        fixtures: {
            xmlByRef: { 'mr-sha': HANDLER_BADGES_BPMN, 'base-sha': HANDLER_BADGES_BPMN },
            changedFiles: [
                { path: 'src/ScoreCarTask.kt', status: 'added' },
                { path: 'src/PrepareDelegate.kt', status: 'changed' },
                { path: 'src/NotifyDelegate.kt', status: 'removed' }
            ],
            contentByRefPath: {
                // added/changed scanned at sourceRef (mr-sha); removed at targetRef (base-sha).
                'mr-sha:src/ScoreCarTask.kt': '@ExternalTaskSubscription("scoreCar")\nclass ScoreCarTask',
                'mr-sha:src/PrepareDelegate.kt': 'class PrepareDelegate',
                'base-sha:src/NotifyDelegate.kt': 'class NotifyDelegate'
            }
        }
    });

    const added = page.locator('.handler-link-added');
    await expect(added).toBeVisible();
    await expect(added).toHaveCSS('background-color', GREEN);
    await expect(added).toHaveAttribute('title', 'Handler added in this MR — open its diff');

    const changed = page.locator('.handler-link-changed');
    await expect(changed).toBeVisible();
    await expect(changed).toHaveCSS('background-color', BLUE);
    await expect(changed).toHaveAttribute('title', 'Handler changed in this MR — open its diff');

    const removed = page.locator('.handler-link-removed');
    await expect(removed).toBeVisible();
    await expect(removed).toHaveCSS('background-color', RED);
    await expect(removed).toHaveAttribute('title', 'Handler removed in this MR — open its diff');
});
