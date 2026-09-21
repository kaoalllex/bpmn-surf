'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { FeedbackReport } = createScope();

const FEEDBACK_URL = 'https://github.com/kaoalllex/bpmn-surf/issues';

const context = {
    extensionVersion: '1.2.0',
    platformKind: 'gitlab',
    hostUrl: 'https://gitlab.example.com',
    changeRequestId: '123',
    fileName: 'process.bpmn',
    fileType: 'BPMN',
    sourceLabel: 'feature/x',
    sourceUrl: 'https://gitlab.example.com/g/p/-/blob/mr-sha/src/process.bpmn',
    targetLabel: 'master',
    targetUrl: 'https://gitlab.example.com/g/p/-/blob/base-sha/src/process.bpmn'
};

const emptyLog = { text: '', omitted: 0 };

const bodyOf = (url) => decodeURIComponent(url.slice(url.indexOf('&body=') + '&body='.length));

describe('FeedbackReport.buildBody', () => {
    const body = FeedbackReport.buildBody(context, emptyLog);

    it('carries every context field the report promises', () => {
        for (const value of ['1.2.0', 'gitlab', 'https://gitlab.example.com', '123',
            'process.bpmn', 'BPMN', 'feature/x', context.sourceUrl, 'master', context.targetUrl]) {
            assert.ok(body.includes(value), `missing from the body: ${value}`);
        }
    });

    it('never includes schema content, whatever the caller puts in the context', () => {
        const polluted = { ...context, xml: '<bpmn:definitions id="Definitions_1"/>' };
        const out = FeedbackReport.buildBody(polluted, emptyLog);
        assert.ok(!out.includes('bpmn:definitions'), out);
        assert.ok(!out.includes('Definitions_1'), out);
    });

    it('describes a branch view with no merge request', () => {
        const out = FeedbackReport.buildBody({ ...context, changeRequestId: undefined }, emptyLog);
        assert.ok(out.includes('branch view (no merge request)'), out);
    });

    it('says so when a side has no file', () => {
        const out = FeedbackReport.buildBody({ ...context, sourceUrl: null }, emptyLog);
        assert.ok(out.includes('n/a (file absent on this side)'), out);
    });

    it('marks the omitted and the dropped lines explicitly', () => {
        const out = FeedbackReport.buildBody(context, { text: 'last line', omitted: 12, debugDropped: 3 });
        assert.ok(out.includes('… 12 earlier lines omitted'), out);
        assert.ok(out.includes('… 3 debug lines dropped to fit the URL'), out);
        assert.ok(out.includes('last line'), out);
    });

    it('omits the markers when nothing was dropped', () => {
        const out = FeedbackReport.buildBody(context, { text: 'only line', omitted: 0 });
        assert.ok(!out.includes('earlier lines omitted'), out);
        assert.ok(!out.includes('debug lines dropped'), out);
    });

    it('escapes a pipe so a ref cannot break the context table', () => {
        const out = FeedbackReport.buildBody({ ...context, sourceLabel: 'wip|hack' }, emptyLog);
        assert.ok(out.includes('wip\\|hack'), out);
    });
});

describe('FeedbackReport.buildUrl', () => {
    it('points at the issue form of the configured feedback URL', () => {
        const url = FeedbackReport.buildUrl(FEEDBACK_URL, context, emptyLog);
        assert.ok(url.startsWith(FEEDBACK_URL + '/new?'), url);
        assert.ok(url.includes('template=bug_report.md'), url);
        assert.ok(url.includes('title=' + encodeURIComponent('[differ] process.bpmn')), url);
    });

    it('keeps the whole URL inside the budget, dropping debug lines first', () => {
        const lines = [];
        for (let i = 0; i < 50; i++) {
            const level = i % 5 === 0 ? 'warn' : 'debug';
            lines.push(`12:00:00.000 ${level} [bpmn-differ.js:${i}]: ${'y'.repeat(80)} n${i}`);
        }
        const url = FeedbackReport.buildUrl(FEEDBACK_URL, context, { text: lines.join('\n'), omitted: 150 });
        assert.ok(url.length <= FeedbackReport.MAX_URL_LENGTH, 'length ' + url.length);

        const body = bodyOf(url);
        assert.ok(body.includes('… 150 earlier lines omitted'), body.slice(0, 600));
        assert.ok(/… \d+ debug lines dropped to fit the URL/.test(body), body.slice(0, 600));
        // The warnings outlive the debug chatter: they are what a reader needs.
        assert.ok(body.includes('n45'), 'the last warn line must survive');
        assert.ok(!body.includes('n1 '), 'early debug lines should be gone');
    });

    it('still produces a usable URL when the log cannot fit at all', () => {
        const url = FeedbackReport.buildUrl(FEEDBACK_URL, context, { text: 'z'.repeat(40000), omitted: 0 });
        assert.ok(url.length <= FeedbackReport.MAX_URL_LENGTH, 'length ' + url.length);
        assert.ok(url.includes('title='), url);
        assert.ok(bodyOf(url).includes('no console output was captured'), bodyOf(url));
    });

    it('leaves a log that already fits untouched', () => {
        const text = '12:00:00.000 debug [bpmn-differ.js:72]: diff params: {}';
        const url = FeedbackReport.buildUrl(FEEDBACK_URL, context, { text, omitted: 0 });
        const body = bodyOf(url);
        assert.ok(body.includes(text), body);
        assert.ok(!body.includes('debug lines dropped'), body);
    });
});
