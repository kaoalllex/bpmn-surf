'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

// e2e-specific fixtures: same semantics as test/fixtures/{base,added-task}.bpmn
// but WITH a bpmndi:BPMNDiagram (DI) section — bpmn-js needs layout info to
// render ("no diagram to display" otherwise); the comparator fixtures omit it.
const baseBpmn = read('test/e2e/fixtures/base.bpmn');
const addedTaskBpmn = read('test/e2e/fixtures/added-task.bpmn');
const camundaModdle = require(path.join(ROOT, 'libs/camunda-bpmn-moddle/resources/camunda.json'));

// Boots the real BPMN differ in the page with an injected fake client.
async function bootBpmnDiffer(page, { params, fixtures }) {
    await page.goto('/test/e2e/harness/differ-harness.html');

    // Load utils.js ONCE (defines loadScripts / loadFileContent). The real
    // loadScripts below re-includes utils.js, but a second load would throw
    // ("const fileCache already declared"), so neutralize that one re-load with
    // an empty data: script. Every other differ script loads fresh into the
    // blank page, exactly as in production.
    await page.addScriptTag({ url: '/src/core/utils.js' });
    await page.evaluate(async () => {
        const getLocalUrl = (name) =>
            name === 'src/core/utils.js' ? 'data:application/javascript,' : '/' + name;
        await loadScripts(document, getLocalUrl);
    });

    await page.addScriptTag({ url: '/test/e2e/support/fake-platform-client.js' });
    await page.evaluate(async ({ params, fixtures }) => {
        const client = new FakePlatformClient(fixtures);
        await new BpmnDiffer(params, client).show();
    }, { params, fixtures });
}

test('boots the BPMN differ and renders the diagram', async ({ page }) => {
    // Surface page errors and console output in the test log (the trace also
    // captures them on failure — see playwright.config.js).
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));
    page.on('console', (msg) => {
        if (msg.type() === 'error') console.log('[console.error]', msg.text());
    });

    const params = {
        platform: { kind: 'fake', projectUrl: 'http://localhost/p', hostUrl: 'http://localhost', projectId: '1' },
        sourceRef: 'mr-sha',
        sourceLabel: 'feature',
        targetRef: 'base-sha',
        targetLabel: 'master',
        filePath: 'diagram.bpmn',
        fileName: 'diagram.bpmn',
        camundaBpmnModdle: camundaModdle
    };
    const fixtures = { xmlByRef: { 'base-sha': baseBpmn, 'mr-sha': addedTaskBpmn } };

    await bootBpmnDiffer(page, { params, fixtures });

    // Toolbar with the primary action rendered.
    await expect(page.locator('.differ-toolbar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch branch' })).toBeVisible();

    // bpmn-js actually rendered the diagram into the canvas cell (showCanvas()
    // flips its visibility once rendering is done).
    const canvas = page.locator('#bpmnCanvas_12345bf3d4e842caa0d88194431197c0');
    await expect(canvas).toBeVisible();
    await expect(canvas.locator('svg .djs-element').first()).toBeVisible();
});
