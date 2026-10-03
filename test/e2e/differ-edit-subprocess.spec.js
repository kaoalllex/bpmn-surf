'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, SUBPROCESS_BASE_BPMN, SUBPROCESS_CHANGED_CHILD_BPMN
} = require('./support/boot-differ');

// Edit mode keeps the view mode's BUG-0010 sign: a subprocess that contains a change
// gets the CHANGE stroke, not the fill. DeepTask_1 sits in the collapsed
// CollapsedSub_1, which sits in the expanded SubProcess_1.
const element = (page, id) => page.locator(`svg .djs-element[data-element-id="${id}"]`);

async function expectContainsChange(page, id) {
    const visual = element(page, id).locator('.djs-visual > rect').first();
    await expect(visual).toHaveCSS('stroke', 'rgb(0, 0, 170)', { timeout: 5000 });
    await expect(visual).not.toHaveCSS('fill', 'rgb(136, 136, 255)');
}

test('edit mode strokes the subprocesses enclosing an MR change', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ mode: 'edit', editSide: 'source' }),
        fixtures: { xmlByRef: { 'base-sha': SUBPROCESS_BASE_BPMN, 'mr-sha': SUBPROCESS_CHANGED_CHILD_BPMN } }
    });

    await expectContainsChange(page, 'SubProcess_1');
    await expectContainsChange(page, 'CollapsedSub_1');
});

test('edit mode strokes the subprocesses enclosing my own edit', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ mode: 'edit', editSide: 'source', sourceRef: 'base-sha', targetRef: 'base-sha' }),
        fixtures: { xmlByRef: { 'base-sha': SUBPROCESS_BASE_BPMN } }
    });

    await page.evaluate(() => {
        const modeler = window.__bpmnDifferModeler;
        modeler.get('modeling').updateProperties(
            modeler.get('elementRegistry').get('DeepTask_1'), { name: 'Renamed' });
    });

    await expectContainsChange(page, 'SubProcess_1');
    await expectContainsChange(page, 'CollapsedSub_1');
});
