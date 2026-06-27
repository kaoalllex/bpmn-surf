'use strict';

// Shared Layer-2 harness helper: boots the real BPMN differ in the page with an
// injected FakePlatformClient. The feature specs (differ-*.spec.js) import this
// so the boot sequence lives in one place and stays in sync with production.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

// Diagrammed (DI-bearing) fixtures — bpmn-js needs layout to render; the
// semantic test/fixtures/ pair omits it. See test/e2e/fixtures/.
const BASE_BPMN = read('test/e2e/fixtures/base.bpmn');
const ADDED_TASK_BPMN = read('test/e2e/fixtures/added-task.bpmn');
const camundaModdle = require(path.join(ROOT, 'libs/camunda-bpmn-moddle/resources/camunda.json'));

// Default scenario: the MR (mr-sha) adds Task_2 'Notify' serviceTask + Flow_3
// over base (base-sha). show() renders the MR side first.
const BPMN_FIXTURES = { xmlByRef: { 'base-sha': BASE_BPMN, 'mr-sha': ADDED_TASK_BPMN } };

function defaultBpmnParams(overrides = {}) {
    return {
        platform: { kind: 'fake', projectUrl: 'http://localhost/p', hostUrl: 'http://localhost', projectId: '1' },
        sourceRef: 'mr-sha',
        sourceLabel: 'feature',
        targetRef: 'base-sha',
        targetLabel: 'master',
        filePath: 'diagram.bpmn',
        fileName: 'diagram.bpmn',
        camundaBpmnModdle: camundaModdle,
        ...overrides
    };
}

// Surface page errors and console.error in the test log (the trace also captures
// them on failure — see playwright.config.js). Call once at the top of a test.
function wireDiagnostics(page) {
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));
    page.on('console', (msg) => {
        if (msg.type() === 'error') console.log('[console.error]', msg.text());
    });
}

async function bootBpmnDiffer(page, { params = defaultBpmnParams(), fixtures = BPMN_FIXTURES } = {}) {
    await page.goto('/test/e2e/harness/differ-harness.html');

    // Load utils.js ONCE (defines loadScripts / loadFileContent). The real
    // loadScripts below re-includes utils.js, but a second load would throw
    // ("const fileCache already declared"), so neutralize that one re-load with
    // an empty data: script. Every other differ script loads fresh.
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

module.exports = {
    ROOT, read, camundaModdle,
    BASE_BPMN, ADDED_TASK_BPMN, BPMN_FIXTURES,
    defaultBpmnParams, wireDiagnostics, bootBpmnDiffer
};
