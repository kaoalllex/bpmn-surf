'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// Flow_2 (Task_1 → EndEvent_1) carries `${approved == true}`. Selecting it makes
// the differ hide the native condition input and inject div.properties-condition
// (id bpmnPropsCondition_…) next to it with the formatted expression. The panel
// mounts async and re-injects on a poll (doWithAttempts) to survive preact
// re-renders, so Playwright's auto-retrying expect waits for it.
//
// We assert the div is ATTACHED with the formatted text, not toBeVisible: the
// native conditionExpression lives in the panel's "Condition" group, which is
// collapsed by default. The differ auto-expands that group only for a flow whose
// source is a Gateway (properties-group-expander.js, Axis B) or whose condition
// the diff recorded as changed (Axis A). Flow_2's source is a task and the
// condition is identical on both sides, so neither axis fires and the group stays
// collapsed — the injected div is therefore present and formatted but display:none
// via its collapsed ancestor. The injection itself is the differ feature here.
test('shows the sequenceFlow condition in the properties panel', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    // The properties panel is mounted by show(); confirm before selecting.
    await expect(page.locator('.bio-properties-panel-scroll-container')).toBeVisible();

    // Select the conditional flow on the canvas. bpmn-js routes connection clicks
    // through the invisible `.djs-hit` zone, not the thin visible path.
    await page.locator('svg .djs-element[data-element-id="Flow_2"] .djs-hit')
        .click({ force: true });

    // The differ injects the formatted condition div next to the native field.
    const condition = page.locator('div.properties-condition');
    await expect(condition).toBeAttached();
    await expect(condition).toContainText('approved');
});
