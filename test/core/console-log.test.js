'use strict';

// The console ring that feeds the FEAT-0024 feedback report: what enters it, what
// its tail selects, and what it refuses to carry.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

describe('ConsoleLog: the ring and its tail', () => {
    // A fresh scope per test: the ring is static state of ConsoleLog.
    function ringScope() {
        const scope = createScope();
        // Silence the proxied output — the proxy still calls the real method.
        for (const level of ['debug', 'info', 'warn', 'error']) {
            scope.window.console[level] = () => {};
        }
        scope.ConsoleLog.install();
        return scope;
    }

    it('keeps the tail in chronological order, tagged with level and call site', () => {
        const scope = ringScope();
        scope.window.console.debug('first');
        scope.window.console.warn('second');
        const { text, omitted } = scope.ConsoleLog.tail();
        const lines = text.split('\n');
        assert.equal(omitted, 0);
        assert.equal(lines.length, 2);
        assert.match(lines[0], /debug \[console-log\.test\.js:\d+\]: first$/);
        assert.match(lines[1], /warn \[console-log\.test\.js:\d+\]: second$/);
    });

    it('evicts the oldest lines past the ring size and reports them as omitted', () => {
        const scope = ringScope();
        for (let i = 0; i < 260; i++) {
            scope.window.console.debug('line-' + i);
        }
        const { text, omitted } = scope.ConsoleLog.tail({ maxLines: 10, maxChars: 4000 });
        const lines = text.split('\n');
        assert.equal(lines.length, 10);
        assert.ok(lines[0].endsWith('line-250'), lines[0]);
        assert.ok(lines[9].endsWith('line-259'), lines[9]);
        // 200 kept of the 260 logged, 10 shown: 190 of the kept ones are omitted.
        assert.equal(omitted, 190);
    });

    it('serialises object and Error arguments instead of [object Object]', () => {
        const scope = ringScope();
        scope.window.console.error('failed', { code: 42 }, new scope.window.Error('boom'));
        const { text } = scope.ConsoleLog.tail();
        assert.ok(text.includes('{"code":42}'), text);
        assert.ok(text.includes('boom'), text);
        assert.ok(!text.includes('[object Object]'), text);
    });

    it('gives an Error more room than an ordinary argument, so stack frames survive', () => {
        const scope = ringScope();
        const error = new scope.window.Error('x'.repeat(280));
        error.stack = `Error: ${'x'.repeat(280)}\n` + '    at someFrame (file.js:1:1)\n'.repeat(20);
        scope.window.console.warn('request failed', error);
        const { text } = scope.ConsoleLog.tail();
        assert.ok(text.includes('at someFrame'), 'the cap must leave room for frames');
        assert.match(text, /…\(\+\d+ chars\)$/);
        // Still capped, just at the larger Error budget.
        assert.ok(text.length < 800, 'length ' + text.length);
    });

    it('caps a single huge argument so a moddle or a diagram cannot land in the ring', () => {
        const scope = ringScope();
        scope.window.console.debug('params', { localFileContent: '<bpmn:definitions>'.repeat(500) });
        const { text } = scope.ConsoleLog.tail();
        assert.ok(text.length < 500, 'length ' + text.length);
        assert.match(text, /…\(\+\d+ chars\)$/);
    });

    it('trims the tail to the character budget, counting the dropped lines', () => {
        const scope = ringScope();
        // Distinct lines: identical ones would collapse into a count instead.
        for (let i = 0; i < 20; i++) {
            scope.window.console.debug('x'.repeat(100) + ' ' + i);
        }
        const { text, omitted } = scope.ConsoleLog.tail({ maxLines: 50, maxChars: 500 });
        assert.ok(text.length <= 500, 'length ' + text.length);
        assert.ok(omitted > 0);
    });

    it('keeps a warning that fell out of the recent window, and marks the gap', () => {
        const scope = ringScope();
        scope.window.console.warn('the one warning that explains everything');
        for (let i = 0; i < 120; i++) {
            scope.window.console.debug('chatter-' + i);
        }
        const { text, omitted } = scope.ConsoleLog.tail({ maxLines: 10, maxChars: 4000 });

        // Tier 2: the warning survives although 120 lines of debug followed it.
        assert.ok(text.includes('the one warning that explains everything'), text);
        // Tier 1: the ten most recent lines, whatever their level.
        assert.ok(text.includes('chatter-119'), text);
        assert.ok(text.includes('chatter-110'), text);
        // Everything between the two tiers is gone, and says so rather than
        // letting the join read as one continuous stream.
        assert.ok(!text.includes('chatter-5 '), text);
        assert.ok(text.includes('… 110 lines skipped'), text);
        // Nothing precedes the warning in the buffer, so nothing is omitted at the head.
        assert.equal(omitted, 0);
    });

    it('does not repeat a signal line that is already in the recent window', () => {
        const scope = ringScope();
        for (let i = 0; i < 5; i++) {
            scope.window.console.debug('chatter-' + i);
        }
        scope.window.console.error('boom once');
        const { text } = scope.ConsoleLog.tail({ maxLines: 10, maxChars: 4000 });
        assert.equal(text.split('boom once').length - 1, 1, text);
        assert.ok(!text.includes('lines skipped'), text);
    });

    it('drops debug from the head under the character budget but keeps the signals', () => {
        const scope = ringScope();
        scope.window.console.warn('early warning');
        for (let i = 0; i < 30; i++) {
            scope.window.console.debug('x'.repeat(100) + ' ' + i);
        }
        const { text } = scope.ConsoleLog.tail({ maxLines: 50, maxChars: 600 });
        assert.ok(text.length <= 600, 'length ' + text.length);
        assert.ok(text.includes(' 29'), 'the newest line must survive');
    });

    it('keeps an info line wherever it sits — every one of them reports a miss', () => {
        const scope = ringScope();
        scope.window.console.info('cannot find bpmn file path by process id: Call1');
        for (let i = 0; i < 80; i++) {
            scope.window.console.debug('chatter-' + i);
        }
        const { text } = scope.ConsoleLog.tail({ maxLines: 10, maxChars: 4000 });
        assert.ok(text.includes('cannot find bpmn file path by process id: Call1'), text);
    });

    it('strips the extension origin from stack frames', () => {
        const scope = ringScope();
        const error = new scope.window.Error('boom');
        error.stack = 'Error: boom\n'
            + '    at loadFileContent (chrome-extension://nhjcomblkinhdfgedpbanobjllkibloo/src/core/utils.js:65:15)';
        scope.window.console.warn('request failed', error);
        const { text } = scope.ConsoleLog.tail();
        assert.ok(!text.includes('chrome-extension://'), text);
        assert.ok(text.includes('at loadFileContent (src/core/utils.js:65:15)'), text);
    });

    it('collapses a run of identical lines into a count', () => {
        const scope = ringScope();
        scope.window.console.debug('before');
        for (let i = 0; i < 4; i++) {
            scope.window.console.info('called process file not found: Call1');
        }
        scope.window.console.debug('after');
        const { text } = scope.ConsoleLog.tail();
        const lines = text.split('\n');
        assert.equal(lines.length, 3, text);
        assert.match(lines[1], /called process file not found: Call1 \(×4\)$/);
    });

    // Two helpers, so each message keeps one call site and so one body: the same
    // text logged from different lines is deliberately not "the same line".
    function switching(scope) {
        const branch = () => scope.window.console.debug('showing branch bpmn xml file...');
        const mr = () => scope.window.console.debug('showing mr bpmn xml file...');
        return { branch, mr };
    }

    it('collapses an alternating pair, which is what Switch branch produces', () => {
        const scope = ringScope();
        const { branch, mr } = switching(scope);
        scope.window.console.debug('before the toggling');
        for (let i = 0; i < 8; i++) {
            branch();
            mr();
        }
        scope.window.console.debug('after the toggling');

        const { text } = scope.ConsoleLog.tail();
        const lines = text.split('\n');
        // before + branch + mr + marker + after, instead of 18 lines.
        assert.equal(lines.length, 5, text);
        assert.ok(lines[1].endsWith('showing branch bpmn xml file...'), lines[1]);
        assert.ok(lines[2].endsWith('showing mr bpmn xml file...'), lines[2]);
        assert.equal(lines[3], '… 14 more lines alternating between these');
        assert.ok(lines[4].endsWith('after the toggling'), lines[4]);
    });

    it('leaves an alternation too short to be worth a marker alone', () => {
        const scope = ringScope();
        const { branch, mr } = switching(scope);
        branch();
        mr();
        branch();
        const { text } = scope.ConsoleLog.tail();
        assert.equal(text.split('\n').length, 3, text);
        assert.ok(!text.includes('alternating'), text);
    });

    it('does not collapse a cycle that a third line broke', () => {
        const scope = ringScope();
        const { branch, mr } = switching(scope);
        branch();
        mr();
        scope.window.console.warn('something else happened');
        branch();
        mr();
        const { text } = scope.ConsoleLog.tail();
        assert.equal(text.split('\n').length, 5, text);
        assert.ok(!text.includes('alternating'), text);
        assert.ok(!text.includes('×'), text);
    });

    it('does not collapse two identical signals the tail selection pulled together', () => {
        // Both warns are promoted out of the buffer, so they end up adjacent in the
        // tail with a "lines skipped" marker between them. Merging them would claim
        // the same thing happened twice in a row, which it did not.
        const scope = ringScope();
        // Through one helper, so both warns share a call site and so a body — two
        // identical messages logged from different lines never look the same.
        const warn = (message) => scope.window.console.warn(message);
        warn('the same signal');
        for (let i = 0; i < 5; i++) {
            scope.window.console.debug('chatter-' + i);
        }
        warn('the same signal');
        const { text } = scope.ConsoleLog.tail({ maxLines: 1, maxChars: 4000 });
        const lines = text.split('\n');
        assert.equal(lines.length, 3, text);
        assert.ok(lines[1].includes('… 5 lines skipped'), text);
        assert.ok(!text.includes('×'), text);
    });

    it('counts one skipped line in the singular', () => {
        const scope = ringScope();
        scope.window.console.warn('the signal');
        scope.window.console.debug('the one line in between');
        scope.window.console.debug('the recent one');
        const { text } = scope.ConsoleLog.tail({ maxLines: 1, maxChars: 4000 });
        assert.ok(text.includes('… 1 line skipped'), text);
    });

    it('collapses a minified library stack to the frame that entered it', () => {
        const scope = ringScope();
        const error = new scope.window.Error('deprecated');
        error.stack = 'Error: deprecated\n'
            + '    at as.getPad (libs/bpmn-js/bpmn-modeler.production.min.js:27:83808)\n'
            + '    at libs/bpmn-js/bpmn-modeler.production.min.js:343:245139\n'
            + '    at Object.click (libs/bpmn-js/bpmn-modeler.production.min.js:343:245208)\n'
            + '    at as.trigger (libs/bpmn-js/bpmn-modeler.production.min.js:27:81733)';
        scope.window.console.warn('library complaint', error);
        const { text } = scope.ConsoleLog.tail();
        assert.ok(text.includes('at as.getPad (libs/bpmn-js/bpmn-modeler.production.min.js:27:83808)'), text);
        assert.ok(text.includes('… 3 more library frames'), text);
        assert.ok(!text.includes('245139'), text);
    });

    it('survives an argument that throws while being stringified', () => {
        // The proxy sits in front of every console.* call on the page, so a
        // hostile argument must not turn a log call into an exception.
        const scope = ringScope();
        const hostile = {
            toJSON() { throw new scope.window.Error('toJSON boom'); },
            toString() { throw new scope.window.Error('toString boom'); }
        };
        assert.doesNotThrow(() => scope.window.console.warn('bad arg incoming', hostile));
        assert.ok(scope.ConsoleLog.tail().text.includes('[unloggable argument]'));
    });

    it('renders an error-like object that fails instanceof Error', () => {
        // A DOMException, and anything thrown across realms — the differ page's
        // scripts are injected by its opener — can fail that test and then come
        // out as `{}`, which is what an unhandled rejection said in a real report.
        const scope = ringScope();
        const crossRealm = {
            name: 'SyntaxError',
            message: "Invalid target origin 'null' in a call to 'postMessage'",
            stack: "SyntaxError: Invalid target origin 'null'\n    at openDiffer (src/core/utils.js:218:15)"
        };
        scope.window.console.warn('the rejection reason was:', crossRealm);
        const { text } = scope.ConsoleLog.tail();
        // Not JSON: that shape would also contain the message and the frame, so
        // asserting on those alone cannot tell the two renderings apart.
        assert.ok(!text.includes('{"name"'), text);
        assert.ok(text.includes("SyntaxError: Invalid target origin 'null'"), text);
        assert.ok(text.includes('at openDiffer (src/core/utils.js:218:15)'), text);
    });

    it('does not mistake an ordinary payload with a message field for an error', () => {
        const scope = ringScope();
        scope.window.console.debug('posting:', { id: 'msg_bpmn', message: 'hello' });
        const { text } = scope.ConsoleLog.tail();
        assert.ok(text.includes('{"id":"msg_bpmn","message":"hello"}'), text);
    });

    it('renders a Map and a Set instead of an empty object', () => {
        const scope = ringScope();
        scope.window.console.debug('changed handler keys (2):',
            new Map([['topic:pay', 'Pay.java'], ['topic:ship', 'Ship.java']]));
        scope.window.console.debug('tags:', new Set(['a', 'b']));
        const { text } = scope.ConsoleLog.tail();
        assert.ok(text.includes('{"topic:pay":"Pay.java","topic:ship":"Ship.java"}'), text);
        assert.ok(text.includes('["a","b"]'), text);
        assert.ok(!text.includes('{}'), text);
    });

    it('keeps a promoted signal when the character budget bites, shedding chatter instead', () => {
        // The budget used to trim from the front of the selection, which is
        // exactly where promoted signals sit — they are older than the recent
        // window by definition — so a long tail silently undid the second tier.
        const scope = ringScope();
        const warn = (message) => scope.window.console.warn(message);
        const debug = (message) => scope.window.console.debug(message);

        warn('cannot blob-search the process file for Call1');
        for (let i = 0; i < 40; i++) {
            debug('old chatter ' + i);
        }
        for (let i = 0; i < 45; i++) {
            debug('recent chatter ' + 'x'.repeat(100) + ' ' + i);
        }

        const { text } = scope.ConsoleLog.tail();
        assert.ok(text.length <= 4000, 'length ' + text.length);
        assert.ok(text.includes('cannot blob-search the process file for Call1'), text);
        // The newest line is still there, so the trimming took the middle.
        assert.ok(text.includes('recent chatter'), text);
        assert.ok(/… \d+ lines? skipped/.test(text), text);
    });

    it('records uncaught errors that never reach console.*', () => {
        const scope = ringScope();
        scope.window.dispatchEvent(new scope.window.ErrorEvent('error', { message: 'uncaught boom' }));
        const { text } = scope.ConsoleLog.tail();
        assert.ok(text.includes('uncaught: uncaught boom'), text);
    });

    it('records unhandled rejections that never reach console.*', () => {
        const scope = ringScope();
        const event = new scope.window.Event('unhandledrejection');
        event.reason = new scope.window.Error('rejected boom');
        scope.window.dispatchEvent(event);
        const { text } = scope.ConsoleLog.tail();
        assert.ok(text.includes('rejected boom'), text);
    });
});

describe('ConsoleLog: library-origin lines', () => {
    const { ConsoleLog } = createScope();

    const stackFrom = (frame) => `Error\n    at Object.apply (src/core/utils.js:3:25)\n${frame}`;

    it('tells a vendored library frame from our own', () => {
        const ours = ConsoleLog.callSite(stackFrom(
            '    at loadFileContent (chrome-extension://abcdef/src/core/utils.js:65:15)'));
        assert.equal(ours.site, ' [utils.js:65]');
        assert.equal(ours.fromLibrary, false);

        const theirs = ConsoleLog.callSite(stackFrom(
            '    at as.getPad (chrome-extension://abcdef/libs/bpmn-js/bpmn-modeler.production.min.js:27:83808)'));
        assert.equal(theirs.site, ' [bpmn-modeler.production.min.js:27]');
        assert.equal(theirs.fromLibrary, true);
    });

    it('never promotes a library line out of the recent window', () => {
        // bpmn-js warns about a deprecated call on every context-pad click and
        // dmn-js errors about its own build on every load (INFRA-0001).
        assert.equal(ConsoleLog.isPromotedSignal({ level: 'warn', fromLibrary: true }), false);
        assert.equal(ConsoleLog.isPromotedSignal({ level: 'error', fromLibrary: true }), false);
        // Ours still are, and debug still is not.
        assert.equal(ConsoleLog.isPromotedSignal({ level: 'warn', fromLibrary: false }), true);
        assert.equal(ConsoleLog.isPromotedSignal({ level: 'info', fromLibrary: false }), true);
        assert.equal(ConsoleLog.isPromotedSignal({ level: 'uncaught', fromLibrary: false }), true);
        assert.equal(ConsoleLog.isPromotedSignal({ level: 'debug', fromLibrary: false }), false);
    });
});

describe('ConsoleLog.describeDifferParams', () => {
    const { ConsoleLog } = createScope();

    const rawParams = {
        platform: { kind: 'gitlab', hostUrl: 'https://gitlab.example.com', projectId: 42 },
        sourceRef: 'mr-sha',
        targetRef: 'base-sha',
        changeRequestId: '123',
        filePath: 'src/process.bpmn',
        fileName: 'process.bpmn',
        camundaBpmnModdle: { name: 'Camunda', types: [{ name: 'camunda:FormField' }] },
        localFileContent: '<bpmn:definitions id="Definitions_1"/>',
        extensionVersion: '1.2.0'
    };

    it('keeps the fields that identify the tab, with refs shortened', () => {
        const described = ConsoleLog.describeDifferParams({ ...rawParams, sourceRef: '90a2e87c4163d33e56c6a5741eb467161efb54f7' });
        assert.equal(described.platform, 'gitlab');
        assert.equal(described.host, 'https://gitlab.example.com');
        // The full sha is already in the report's links; here it only crowds out
        // the rest of the line, which is capped.
        assert.equal(described.sourceRef, '90a2e87c');
        assert.equal(described.targetRef, 'base-sha');
        assert.equal(described.changeRequestId, '123');
        assert.equal(described.filePath, 'src/process.bpmn');
        assert.equal(described.extensionVersion, '1.2.0');
    });

    it('drops the moddle descriptor and the local diagram content', () => {
        const serialised = JSON.stringify(ConsoleLog.describeDifferParams(rawParams));
        assert.ok(!serialised.includes('camunda:FormField'), serialised);
        assert.ok(!serialised.includes('bpmn:definitions'), serialised);
        // ...but still says a local file is in play, which matters when triaging.
        assert.equal(ConsoleLog.describeDifferParams(rawParams).localFile, true);
        assert.equal(ConsoleLog.describeDifferParams({ platform: {} }).localFile, false);
    });
});

describe('ConsoleLog.describeImportError', () => {
    const { ConsoleLog } = createScope();

    // Verbatim from bpmn-js: a parse that dies on a text node quotes that text.
    const leaky = new Error('unparsable content Pay supplier ACME under contract '
        + '44-19/b, account 40817810099910004312, approver a.ivanov detected\n'
        + '\tline: 0\n\tcolumn: 172\n\tnested error: unexpected end of file');

    it('drops the quoted document and keeps what locates the failure', () => {
        const described = ConsoleLog.describeImportError(leaky);
        assert.ok(!described.includes('ACME'), described);
        assert.ok(!described.includes('40817810099910004312'), described);
        assert.ok(!described.includes('a.ivanov'), described);
        assert.ok(!described.includes('unparsable content'), described);
        assert.equal(described, 'Error: line 0, column 172 — unexpected end of file');
    });

    it('drops a quoted tag name too', () => {
        const described = ConsoleLog.describeImportError(new Error(
            'unparsable content <bpmn:serviceTask id="PaySupplier"> detected; this may '
            + 'indicate an invalid BPMN 2.0 diagram file\n\tline: 0\n\tcolumn: 129\n'
            + '\tnested error: closing tag mismatch'));
        assert.ok(!described.includes('bpmn:serviceTask'), described);
        assert.ok(!described.includes('PaySupplier'), described);
        assert.equal(described, 'Error: line 0, column 129 — closing tag mismatch');
    });

    it('withholds everything when the shape is not recognised', () => {
        // A library upgrade may reword the message; nothing matched must leak nothing.
        const described = ConsoleLog.describeImportError(new Error('totally new wording quoting <secret/>'));
        assert.ok(!described.includes('secret'), described);
        assert.equal(described, 'import failed; details withheld — they can quote the document');
    });
});
