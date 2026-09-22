'use strict';

// FEAT-0024's core promise, guarded end to end rather than at the seam: a report
// must carry no diagram content. The unit test only pollutes the context object;
// the log tail reaches the body as an opaque string, and that is the way a real
// leak got in — bpmn-js renders a failed parse as `unparsable content <a raw
// slice of the document> detected`, which our own catch then logged verbatim.
const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, defaultBpmnParams } = require('./support/boot-differ');

const SECRET = 'account 40817810099910004312 approver a.ivanov';

// Cut off mid text node, so the parser dies with no further '<' and quotes the
// whole remaining run — the case bpmn-js does NOT shorten to a tag name.
const TRUNCATED_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D1">
  <bpmn:process id="Invoice"><bpmn:documentation>Pay supplier ACME under contract ${SECRET}`;

test('a failed import does not put the diagram into the report', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ sourceRef: null, sourceLabel: null }),
        fixtures: { xmlByRef: { 'base-sha': TRUNCATED_BPMN } }
    });

    // The import failed, so the differ logged it — the line must be there, redacted.
    await page.evaluate(() => {
        window.__feedbackUrl = null;
        window.open = (url) => { window.__feedbackUrl = url; return null; };
    });
    await page.click('button.differ-btn:has-text("💬")');
    const url = await page.evaluate(() => window.__feedbackUrl);
    const body = decodeURIComponent(url.slice(url.indexOf('&body=') + '&body='.length));

    expect(body).toContain('bpmn schema loading error');
    // Redacted to the position and the parser's own reason.
    expect(body).toMatch(/bpmn schema loading error Error: line \d+, column \d+ — /);
    // Nothing of the document itself.
    expect(body).not.toContain('40817810099910004312');
    expect(body).not.toContain('a.ivanov');
    expect(body).not.toContain('ACME');
    expect(body).not.toContain('unparsable content');
    expect(body).not.toContain('bpmn:definitions');
    expect(body).not.toContain('bpmn:documentation');
});
