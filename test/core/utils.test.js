'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const {
    getFileNameFromPath,
    getFileNameWithoutExtensionFromPath,
    shortenCommitId,
    capitalizeFirstLetter,
    getTitle,
    requireDefined,
    doWithAttempts
} = createScope();

describe('getFileNameFromPath', () => {
    it('returns last path segment', () => {
        assert.equal(getFileNameFromPath('dir/sub/process.bpmn'), 'process.bpmn');
    });

    it('returns the path itself when there is no slash', () => {
        assert.equal(getFileNameFromPath('process.bpmn'), 'process.bpmn');
    });
});

describe('getFileNameWithoutExtensionFromPath', () => {
    it('strips the extension', () => {
        assert.equal(getFileNameWithoutExtensionFromPath('dir/process.bpmn'), 'process');
    });

    it('keeps only the part before the last dot', () => {
        assert.equal(getFileNameWithoutExtensionFromPath('a/b/my.process.bpmn'), 'my.process');
    });
});

describe('shortenCommitId', () => {
    it('shortens a full sha to the first 8 chars', () => {
        assert.equal(shortenCommitId('ffffeeee0000111122223333444455556666aaaa'), 'ffffeeee');
    });

    it('leaves a shorter string untouched', () => {
        assert.equal(shortenCommitId('abc'), 'abc');
    });

    it('returns non-string input unchanged', () => {
        assert.equal(shortenCommitId(null), null);
        assert.equal(shortenCommitId(undefined), undefined);
    });
});

describe('capitalizeFirstLetter', () => {
    it('capitalizes the first letter', () => {
        assert.equal(capitalizeFirstLetter('bpmn'), 'Bpmn');
    });

    it('returns empty string unchanged', () => {
        assert.equal(capitalizeFirstLetter(''), '');
    });
});

describe('getTitle', () => {
    it('keeps short names unchanged', () => {
        assert.equal(getTitle('short.bpmn'), 'short.bpmn');
    });

    it('inserts a space every 31 characters to allow wrapping', () => {
        const name = 'x'.repeat(35);
        assert.equal(getTitle(name), 'x'.repeat(31) + ' ' + 'x'.repeat(4));
    });
});

describe('requireDefined', () => {
    it('returns the value when defined', () => {
        assert.equal(requireDefined('value', 'arg'), 'value');
    });

    it('throws with the argument name when undefined', () => {
        assert.throws(() => requireDefined(undefined, 'myArg'), /myArg is undefined/);
    });
});

describe('doWithAttempts', () => {
    it('returns the first truthy result', async () => {
        let calls = 0;
        const res = await doWithAttempts(() => (++calls === 2 ? 'ok' : null), 5, 1);
        assert.equal(res, 'ok');
        assert.equal(calls, 2);
    });

    it('returns null after exactly `attempts` checks when all fail', async () => {
        let calls = 0;
        const res = await doWithAttempts(() => { calls++; return null; }, 3, 1);
        assert.equal(res, null);
        // Exactly `attempts` checks, no more (and no extra trailing wait).
        assert.equal(calls, 3);
    });
});

describe('console log ring (FEAT-0024)', () => {
    // A fresh scope per test: the ring is module state of utils.js.
    function ringScope() {
        const scope = createScope();
        // Silence the proxied output — the proxy still calls the real method.
        for (const level of ['debug', 'info', 'warn', 'error']) {
            scope.window.console[level] = () => {};
        }
        scope.appendTimeToConsoleLogs();
        return scope;
    }

    it('keeps the tail in chronological order, tagged with level and call site', () => {
        const scope = ringScope();
        scope.window.console.debug('first');
        scope.window.console.warn('second');
        const { text, omitted } = scope.getConsoleLogTail();
        const lines = text.split('\n');
        assert.equal(omitted, 0);
        assert.equal(lines.length, 2);
        assert.match(lines[0], /debug \[utils\.test\.js:\d+\]: first$/);
        assert.match(lines[1], /warn \[utils\.test\.js:\d+\]: second$/);
    });

    it('evicts the oldest lines past the ring size and reports them as omitted', () => {
        const scope = ringScope();
        for (let i = 0; i < 260; i++) {
            scope.window.console.debug('line-' + i);
        }
        const { text, omitted } = scope.getConsoleLogTail({ maxLines: 10, maxChars: 4000 });
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
        const { text } = scope.getConsoleLogTail();
        assert.ok(text.includes('{"code":42}'), text);
        assert.ok(text.includes('boom'), text);
        assert.ok(!text.includes('[object Object]'), text);
    });

    it('gives an Error more room than an ordinary argument, so stack frames survive', () => {
        const scope = ringScope();
        const error = new scope.window.Error('x'.repeat(280));
        error.stack = `Error: ${'x'.repeat(280)}\n` + '    at someFrame (file.js:1:1)\n'.repeat(20);
        scope.window.console.warn('request failed', error);
        const { text } = scope.getConsoleLogTail();
        assert.ok(text.includes('at someFrame'), 'the cap must leave room for frames');
        assert.match(text, /…\(\+\d+ chars\)$/);
        // Still capped, just at the larger Error budget.
        assert.ok(text.length < 800, 'length ' + text.length);
    });

    it('caps a single huge argument so a moddle or a diagram cannot land in the ring', () => {
        const scope = ringScope();
        scope.window.console.debug('params', { localFileContent: '<bpmn:definitions>'.repeat(500) });
        const { text } = scope.getConsoleLogTail();
        assert.ok(text.length < 500, 'length ' + text.length);
        assert.match(text, /…\(\+\d+ chars\)$/);
    });

    it('trims the tail to the character budget, counting the dropped lines', () => {
        const scope = ringScope();
        // Distinct lines: identical ones would collapse into a count instead.
        for (let i = 0; i < 20; i++) {
            scope.window.console.debug('x'.repeat(100) + ' ' + i);
        }
        const { text, omitted } = scope.getConsoleLogTail({ maxLines: 50, maxChars: 500 });
        assert.ok(text.length <= 500, 'length ' + text.length);
        assert.ok(omitted > 0);
    });

    it('keeps a warning that fell out of the recent window, and marks the gap', () => {
        const scope = ringScope();
        scope.window.console.warn('the one warning that explains everything');
        for (let i = 0; i < 120; i++) {
            scope.window.console.debug('chatter-' + i);
        }
        const { text, omitted } = scope.getConsoleLogTail({ maxLines: 10, maxChars: 4000 });

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
        const { text } = scope.getConsoleLogTail({ maxLines: 10, maxChars: 4000 });
        assert.equal(text.split('boom once').length - 1, 1, text);
        assert.ok(!text.includes('lines skipped'), text);
    });

    it('drops debug from the head under the character budget but keeps the signals', () => {
        const scope = ringScope();
        scope.window.console.warn('early warning');
        for (let i = 0; i < 30; i++) {
            scope.window.console.debug('x'.repeat(100) + ' ' + i);
        }
        const { text } = scope.getConsoleLogTail({ maxLines: 50, maxChars: 600 });
        assert.ok(text.length <= 600, 'length ' + text.length);
        assert.ok(text.includes(' 29'), 'the newest line must survive');
    });

    it('keeps an info line wherever it sits — every one of them reports a miss', () => {
        const scope = ringScope();
        scope.window.console.info('cannot find bpmn file path by process id: Call1');
        for (let i = 0; i < 80; i++) {
            scope.window.console.debug('chatter-' + i);
        }
        const { text } = scope.getConsoleLogTail({ maxLines: 10, maxChars: 4000 });
        assert.ok(text.includes('cannot find bpmn file path by process id: Call1'), text);
    });

    it('strips the extension origin from stack frames', () => {
        const scope = ringScope();
        const error = new scope.window.Error('boom');
        error.stack = 'Error: boom\n'
            + '    at loadFileContent (chrome-extension://nhjcomblkinhdfgedpbanobjllkibloo/src/core/utils.js:65:15)';
        scope.window.console.warn('request failed', error);
        const { text } = scope.getConsoleLogTail();
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
        const { text } = scope.getConsoleLogTail();
        const lines = text.split('\n');
        assert.equal(lines.length, 3, text);
        assert.match(lines[1], /called process file not found: Call1 \(×4\)$/);
    });

    it('does not collapse repeats that something else came between', () => {
        const scope = ringScope();
        scope.window.console.debug('showing branch');
        scope.window.console.debug('showing mr');
        scope.window.console.debug('showing branch');
        const { text } = scope.getConsoleLogTail();
        assert.equal(text.split('\n').length, 3, text);
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
        const { text } = scope.getConsoleLogTail({ maxLines: 1, maxChars: 4000 });
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
        const { text } = scope.getConsoleLogTail({ maxLines: 1, maxChars: 4000 });
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
        const { text } = scope.getConsoleLogTail();
        assert.ok(text.includes('at as.getPad (libs/bpmn-js/bpmn-modeler.production.min.js:27:83808)'), text);
        assert.ok(text.includes('… 3 more library frames'), text);
        assert.ok(!text.includes('245139'), text);
    });

    it('records uncaught errors that never reach console.*', () => {
        const scope = ringScope();
        scope.window.dispatchEvent(new scope.window.ErrorEvent('error', { message: 'uncaught boom' }));
        const { text } = scope.getConsoleLogTail();
        assert.ok(text.includes('uncaught: uncaught boom'), text);
    });

    it('records unhandled rejections that never reach console.*', () => {
        const scope = ringScope();
        const event = new scope.window.Event('unhandledrejection');
        event.reason = new scope.window.Error('rejected boom');
        scope.window.dispatchEvent(event);
        const { text } = scope.getConsoleLogTail();
        assert.ok(text.includes('rejected boom'), text);
    });
});

describe('describeDifferParams (FEAT-0024)', () => {
    const { describeDifferParams } = createScope();

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
        const described = describeDifferParams({ ...rawParams, sourceRef: '90a2e87c4163d33e56c6a5741eb467161efb54f7' });
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
        const serialised = JSON.stringify(describeDifferParams(rawParams));
        assert.ok(!serialised.includes('camunda:FormField'), serialised);
        assert.ok(!serialised.includes('bpmn:definitions'), serialised);
        // ...but still says a local file is in play, which matters when triaging.
        assert.equal(describeDifferParams(rawParams).localFile, true);
        assert.equal(describeDifferParams({ platform: {} }).localFile, false);
    });
});

describe('library-origin log lines (FEAT-0024)', () => {
    const { callSiteFromStack, isPromotedSignal } = createScope();

    const stackFrom = (frame) => `Error\n    at Object.apply (src/core/utils.js:3:25)\n${frame}`;

    it('tells a vendored library frame from our own', () => {
        const ours = callSiteFromStack(stackFrom(
            '    at loadFileContent (chrome-extension://abcdef/src/core/utils.js:65:15)'));
        assert.equal(ours.site, ' [utils.js:65]');
        assert.equal(ours.fromLibrary, false);

        const theirs = callSiteFromStack(stackFrom(
            '    at as.getPad (chrome-extension://abcdef/libs/bpmn-js/bpmn-modeler.production.min.js:27:83808)'));
        assert.equal(theirs.site, ' [bpmn-modeler.production.min.js:27]');
        assert.equal(theirs.fromLibrary, true);
    });

    it('never promotes a library line out of the recent window', () => {
        // bpmn-js warns about a deprecated call on every context-pad click and
        // dmn-js errors about its own build on every load (INFRA-0001).
        assert.equal(isPromotedSignal({ level: 'warn', fromLibrary: true }), false);
        assert.equal(isPromotedSignal({ level: 'error', fromLibrary: true }), false);
        // Ours still are, and debug still is not.
        assert.equal(isPromotedSignal({ level: 'warn', fromLibrary: false }), true);
        assert.equal(isPromotedSignal({ level: 'info', fromLibrary: false }), true);
        assert.equal(isPromotedSignal({ level: 'uncaught', fromLibrary: false }), true);
        assert.equal(isPromotedSignal({ level: 'debug', fromLibrary: false }), false);
    });
});
