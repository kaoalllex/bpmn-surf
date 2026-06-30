'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, HANDLER_BADGES_BPMN
} = require('./support/boot-differ');

// BUG-0016: "ExternalTask" is NAMED, so bpmn-js creates a separate label element
// sharing the task's businessObject. refreshChangedBadges iterates every element
// (labels included); without the labelTarget guard the named task would get TWO
// badges (host + label). Only the external-task handler is changed here, so exactly
// ONE handler badge must exist.
test('does not duplicate the badge on a labelled changed handler', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ changeRequestId: 42 }),
        fixtures: {
            xmlByRef: { 'mr-sha': HANDLER_BADGES_BPMN, 'base-sha': HANDLER_BADGES_BPMN },
            changedFiles: [{ path: 'src/ScoreCarTask.kt', status: 'added' }],
            contentByRefPath: {
                'mr-sha:src/ScoreCarTask.kt': '@ExternalTaskSubscription("scoreCar")\nclass ScoreCarTask'
            }
        }
    });

    // The added badge appears...
    await expect(page.locator('.handler-link-added')).toBeVisible();
    // ...exactly once — the named element's label did not get a second one.
    await expect(page.locator('.handler-link')).toHaveCount(1);
});
