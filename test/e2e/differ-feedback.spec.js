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

test('BPMN differ: a branch-only tab reports no merge request and no compared side', async ({ page }) => {
    wireDiagnostics(page);
    const { defaultBpmnParams } = require('./support/boot-differ.js');
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ sourceRef: null, sourceLabel: null })
    });

    const { body } = await pressFeedback(page);
    expect(body).toContain('branch view (no merge request)');
    expect(body).toContain('n/a (file absent on this side)');
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
