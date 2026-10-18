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

describe('openBlankTab', () => {
    it('opens the tab itself outside a Firefox content script', () => {
        const scope = createScope();
        const opened = {};
        scope.window.open = (url) => (opened.url = url, opened);
        assert.equal(scope.openBlankTab(), opened);
        assert.equal(opened.url, 'about:blank');
    });

    it('has the page open it in a Firefox content script and Xray-wraps the result', () => {
        const scope = createScope();
        const pageTab = {};
        scope.window.open = () => assert.fail('the content script must not open the tab itself');
        scope.window.wrappedJSObject = { open: (url) => (pageTab.url = url, pageTab) };
        scope.window.XPCNativeWrapper = (tab) => ({ xray: tab });
        assert.deepEqual(scope.openBlankTab(), { xray: pageTab });
        assert.equal(pageTab.url, 'about:blank');
    });

    it('passes a blocked pop-up on as null', () => {
        const scope = createScope();
        scope.window.wrappedJSObject = { open: () => null };
        scope.window.XPCNativeWrapper = () => assert.fail('nothing to wrap');
        assert.equal(scope.openBlankTab(), null);
    });
});
