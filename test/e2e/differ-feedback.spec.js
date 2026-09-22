'use strict';

// FEAT-0024: the 💬 button in both differ toolbars opens a prefilled GitHub
// issue. window.open is stubbed so the test reads the URL instead of opening a
// tab; nothing here touches the network, which is the point of the feature.
const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, bootDmnDiffer, wireDiagnostics } = require('./support/boot-differ.js');

const FEEDBACK = 'button.differ-btn:has-text("💬")';

async function stubWindowOpen(page) {
    await page.evaluate(() => {
        window.__feedbackUrl = null;
        window.open = (url) => { window.__feedbackUrl = url; return null; };
    });
}

async function pressFeedback(page) {
    await stubWindowOpen(page);
    await page.click(FEEDBACK);
    const url = await page.evaluate(() => window.__feedbackUrl);
    expect(url).not.toBeNull();
    return { url, body: decodeURIComponent(url.slice(url.indexOf('&body=') + '&body='.length)) };
}

test('BPMN differ: the feedback button opens a prefilled issue', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    await expect(page.locator(FEEDBACK)).toHaveCount(1);
    const { url, body } = await pressFeedback(page);

    expect(url.startsWith('https://github.com/kaoalllex/bpmn-surf/issues/new?')).toBe(true);
    expect(url).toContain('template=bug_report.md');
    expect(url).toContain('title=' + encodeURIComponent('[differ] diagram.bpmn'));
    expect(url.length).toBeLessThanOrEqual(7000);

    expect(body).toContain('diagram.bpmn');
    expect(body).toContain('(BPMN)');
    expect(body).toContain('feature');
    expect(body).toContain('master');
    expect(body).toContain('http://localhost/blob/mr-sha/diagram.bpmn');
    expect(body).toContain('http://localhost/blob/base-sha/diagram.bpmn');
    // The console tail is there, and the diagram never is.
    expect(body).toContain('diff params:');
    expect(body).not.toContain('bpmn:definitions');
});

test('BPMN differ: a branch-only tab reports one version, not a half-empty comparison', async ({ page }) => {
    wireDiagnostics(page);
    const { defaultBpmnParams } = require('./support/boot-differ.js');
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ sourceRef: null, sourceLabel: null })
    });

    const { body } = await pressFeedback(page);
    expect(body).toContain('branch view (no merge request)');
    expect(body).toContain('| Version | master — http://localhost/blob/base-sha/diagram.bpmn |');
    expect(body).not.toContain('| Compared |');
    // The old rendering claimed a missing file and stacked three dashes.
    expect(body).not.toContain('file absent on this side');
    expect(body).not.toContain('— —');
});

test('BPMN differ: a local-file comparison is named as one, not as a missing file', async ({ page }) => {
    wireDiagnostics(page);
    const { defaultBpmnParams, read } = require('./support/boot-differ.js');
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({
            sourceRef: null,
            sourceLabel: 'my-draft.bpmn',
            localFileContent: read('test/e2e/fixtures/added-task.bpmn')
        })
    });

    const { body } = await pressFeedback(page);
    expect(body).toContain('| Compared | local file "my-draft.bpmn" (not in the repository) |');
    expect(body).toContain('| Against | master — http://localhost/blob/base-sha/diagram.bpmn |');
    expect(body).not.toContain('file absent on this side');
    // The local file's own content is never quoted back.
    expect(body).not.toContain('bpmn:definitions');
});

test('DMN differ: the feedback button opens a prefilled issue', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page);

    await expect(page.locator(FEEDBACK)).toHaveCount(1);
    const { url, body } = await pressFeedback(page);

    expect(url).toContain('title=' + encodeURIComponent('[differ] decision.dmn'));
    expect(body).toContain('decision.dmn');
    expect(body).toContain('(DMN)');
    expect(body).toContain('http://localhost/blob/mr-sha/decision.dmn');
    expect(body).not.toContain('dmn:definitions');
});

// The badge fires on an uncaught failure only. console.error is deliberately not
// a trigger: dmn-js logs one on every load (INFRA-0001), which this very run
// mirrors into the log as [console.error].
for (const [label, boot] of [['BPMN', bootBpmnDiffer], ['DMN', bootDmnDiffer]]) {
    test(`${label} differ: an uncaught error badges the feedback button`, async ({ page }) => {
        wireDiagnostics(page);
        await boot(page);

        const button = page.locator(FEEDBACK);
        await expect(button).toHaveCount(1);
        await expect(button).not.toHaveClass(/differ-feedback-alert/);
        await expect(button).toHaveAttribute('title', 'Report a problem or send feedback');

        await page.evaluate(() => window.dispatchEvent(
            new ErrorEvent('error', { message: 'probe failure' })));

        await expect(button).toHaveClass(/differ-feedback-alert/);
        await expect(button).toHaveAttribute('title', 'Something went wrong — report it');
        // The dot is the persistent part of the signal, so it must actually render.
        const dot = await button.evaluate(el =>
            getComputedStyle(el, '::after').backgroundColor);
        expect(dot).toBe('rgb(195, 34, 34)');
    });

    test(`${label} differ: console.error alone does not badge the button`, async ({ page }) => {
        wireDiagnostics(page);
        await boot(page);

        const button = page.locator(FEEDBACK);
        await expect(button).toHaveCount(1);
        await page.evaluate(() => console.error('a benign library complaint'));
        await expect(button).not.toHaveClass(/differ-feedback-alert/);
    });
}

// The toolbar's right edge is a promise to the user: the panel toggle and 💬 sit
// together, immediately left of Close, in BOTH modes — the FEAT-0031 edit bar used
// to keep the panel toggle in a group of its own further left.
const tailOf = (page) => page.evaluate(() =>
    [...document.querySelectorAll('.differ-toolbar .differ-btn')]
        .map(b => b.textContent).slice(-3));

test('BPMN view mode ends with the panel toggle, feedback and close', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);
    expect(await tailOf(page)).toEqual(['◨', '💬', '✕']);
});

test('BPMN edit mode ends the same way', async ({ page }) => {
    const { defaultBpmnParams } = require('./support/boot-differ.js');
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: defaultBpmnParams({ mode: 'edit', editSide: 'source' }) });
    expect(await tailOf(page)).toEqual(['◨', '💬', '✕']);
});

test('DMN has no properties panel, so its bar ends with feedback and close', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page);
    expect(await tailOf(page)).toEqual(expect.arrayContaining(['💬', '✕']));
});

test('BPMN edit mode: the report says which side is being edited', async ({ page }) => {
    const { defaultBpmnParams } = require('./support/boot-differ.js');
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: defaultBpmnParams({ mode: 'edit', editSide: 'source' }) });

    const { body } = await pressFeedback(page);
    expect(body).toContain('**edit mode**, editing the source side');
    // Nothing in the edit subsystem logs, so this row is all a reader gets
    // about the editing itself.
    expect(body).toContain('| Edit session | untouched, colouring on |');
});

test('BPMN edit mode: the report notices that the diagram was edited', async ({ page }) => {
    const { defaultBpmnParams } = require('./support/boot-differ.js');
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: defaultBpmnParams({ mode: 'edit', editSide: 'source' }) });

    // Rename a task through the modeler — that is what puts a command on the stack.
    await page.evaluate(() => {
        const modeler = window.__bpmnDifferModeler;
        modeler.get('modeling').updateProperties(
            modeler.get('elementRegistry').get('Task_1'), { name: 'Renamed by the test' });
    });
    await expect(page.locator('.edit-diff-changed')).toHaveCount(1, { timeout: 5000 });

    const { body } = await pressFeedback(page);
    expect(body).toContain('| Edit session | edited, colouring on |');
});
