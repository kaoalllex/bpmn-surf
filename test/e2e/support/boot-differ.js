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
const CALL_ACTIVITY_BPMN = read('test/e2e/fixtures/call-activity.bpmn');
const CHANGED_TASK_NAME_BPMN = read('test/e2e/fixtures/changed-task-name.bpmn');
const SUBPROCESS_BASE_BPMN = read('test/e2e/fixtures/subprocess-base.bpmn');
const SUBPROCESS_CHANGED_CHILD_BPMN = read('test/e2e/fixtures/subprocess-changed-child.bpmn');
const CHANGED_FLOW_CONDITION_BPMN = read('test/e2e/fixtures/changed-flow-condition.bpmn');
const CALL_ACTIVITY_IN_BASE_BPMN = read('test/e2e/fixtures/call-activity-in-base.bpmn');
const CALL_ACTIVITY_IN_CHANGED_BPMN = read('test/e2e/fixtures/call-activity-in-changed.bpmn');
const SEARCH_MULTI_BPMN = read('test/e2e/fixtures/search-multi.bpmn');
const BUSINESS_RULE_TASK_BPMN = read('test/e2e/fixtures/business-rule-task.bpmn');
const MESSAGE_CORRELATION_BPMN = read('test/e2e/fixtures/message-correlation.bpmn');
const HANDLER_BADGES_BPMN = read('test/e2e/fixtures/handler-badges.bpmn');
const camundaModdle = require(path.join(ROOT, 'libs/camunda-bpmn-moddle/resources/camunda.json'));

// Default scenario: the MR (mr-sha) adds Task_2 'Notify' serviceTask + Flow_3
// over base (base-sha). show() renders the MR side first.
const BPMN_FIXTURES = { xmlByRef: { 'base-sha': BASE_BPMN, 'mr-sha': ADDED_TASK_BPMN } };

// DMN fixtures — semantic-only (no DI); dmn-js renders the decision table from
// semantics directly. base.dmn has 2 rules; added-rule.dmn adds a third.
const BASE_DMN = read('test/fixtures/base.dmn');
const ADDED_RULE_DMN = read('test/fixtures/added-rule.dmn');
const CHANGED_CELL_DMN = read('test/fixtures/dmn-cell-changed.dmn');
const CHANGED_HEADER_DMN = read('test/fixtures/changed-header.dmn');
const CHANGED_INPUT_DMN = read('test/fixtures/changed-input.dmn');
const CHANGED_OUTPUT_LABEL_DMN = read('test/fixtures/changed-output-label.dmn');
const ADDED_INPUT_COLUMN_DMN = read('test/fixtures/added-input-column.dmn');
const ADDED_OUTPUT_COLUMN_DMN = read('test/fixtures/added-output-column.dmn');
const DMN_FIXTURES = { xmlByRef: { 'base-sha': BASE_DMN, 'mr-sha': ADDED_RULE_DMN } };

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

function defaultDmnParams(overrides = {}) {
    return {
        platform: { kind: 'fake', projectUrl: 'http://localhost/p', hostUrl: 'http://localhost', projectId: '1' },
        sourceRef: 'mr-sha',
        sourceLabel: 'feature',
        targetRef: 'base-sha',
        targetLabel: 'master',
        filePath: 'decision.dmn',
        fileName: 'decision.dmn',
        ...overrides
    };
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
        // Kept on window so a spec can inspect what the differ asked the platform for.
        window.__platformClient = client;
        await new BpmnDiffer(params, client).show();
    }, { params, fixtures });
}

async function bootDmnDiffer(page, { params = defaultDmnParams(), fixtures = DMN_FIXTURES } = {}) {
    await page.goto('/test/e2e/harness/differ-harness.html');

    // Load utils.js ONCE (see bootBpmnDiffer for why the re-include is neutralized).
    await page.addScriptTag({ url: '/src/core/utils.js' });
    await page.evaluate(async () => {
        const getLocalUrl = (name) =>
            name === 'src/core/utils.js' ? 'data:application/javascript,' : '/' + name;
        await loadScripts(document, getLocalUrl);
    });

    await page.addScriptTag({ url: '/test/e2e/support/fake-platform-client.js' });
    await page.evaluate(async ({ params, fixtures }) => {
        const client = new FakePlatformClient(fixtures);
        // Kept on window so a spec can inspect what the differ asked the platform for.
        window.__platformClient = client;
        await new DmnDiffer(params, client).show();
    }, { params, fixtures });
}

module.exports = {
    ROOT, read, camundaModdle,
    BASE_BPMN, ADDED_TASK_BPMN, CALL_ACTIVITY_BPMN, CHANGED_TASK_NAME_BPMN,
    SUBPROCESS_BASE_BPMN, SUBPROCESS_CHANGED_CHILD_BPMN, CHANGED_FLOW_CONDITION_BPMN,
    CALL_ACTIVITY_IN_BASE_BPMN, CALL_ACTIVITY_IN_CHANGED_BPMN, SEARCH_MULTI_BPMN, BUSINESS_RULE_TASK_BPMN, MESSAGE_CORRELATION_BPMN, HANDLER_BADGES_BPMN, BPMN_FIXTURES,
    BASE_DMN, ADDED_RULE_DMN, CHANGED_CELL_DMN, CHANGED_HEADER_DMN,
    CHANGED_INPUT_DMN, CHANGED_OUTPUT_LABEL_DMN, ADDED_INPUT_COLUMN_DMN, ADDED_OUTPUT_COLUMN_DMN, DMN_FIXTURES,
    defaultBpmnParams, defaultDmnParams,
    wireDiagnostics, bootBpmnDiffer, bootDmnDiffer
};
