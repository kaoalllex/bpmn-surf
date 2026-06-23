'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { CallActivityLocator, GitLabPlatformClient } = createScope();

// A GitLab client over a fixed project, so blobSearchPageUrl asserts the real
// URL format the locator now delegates to (REFAC-0004).
const client = new GitLabPlatformClient({
    projectUrl: 'https://gitlab.example/group/proj',
    hostUrl: 'https://gitlab.example',
    projectId: 42
});

describe('CallActivityLocator.isBpmnFile', () => {
    it('accepts BPMN files', () => {
        assert.equal(CallActivityLocator.isBpmnFile('src/main/resources/bpmn/PrepareItem.bpmn'), true);
    });

    it('rejects non-BPMN files', () => {
        assert.equal(CallActivityLocator.isBpmnFile('src/main/kotlin/ScoreCarTask.kt'), false);
        assert.equal(CallActivityLocator.isBpmnFile('README.md'), false);
    });

    it('rejects empty or null paths', () => {
        assert.equal(CallActivityLocator.isBpmnFile(''), false);
        assert.equal(CallActivityLocator.isBpmnFile(null), false);
        assert.equal(CallActivityLocator.isBpmnFile(undefined), false);
    });
});

describe('CallActivityLocator.selectProcessFile', () => {
    it('returns null when items is not an array', () => {
        assert.equal(CallActivityLocator.selectProcessFile(null, 'Foo'), null);
        assert.equal(CallActivityLocator.selectProcessFile(undefined, 'Foo'), null);
    });

    it('returns null for an empty list', () => {
        assert.equal(CallActivityLocator.selectProcessFile([], 'Foo'), null);
    });

    it('returns null when no item is a BPMN file', () => {
        const items = [
            { path: 'src/Foo.kt', snippet: 'process id="Foo"' },
            { path: 'README.md', snippet: 'process id="Foo"' }
        ];
        assert.equal(CallActivityLocator.selectProcessFile(items, 'Foo'), null);
    });

    it('selects the only BPMN hit', () => {
        const items = [{ path: 'bpmn/Foo.bpmn', snippet: '<bpmn:process id="Foo">' }];
        const res = CallActivityLocator.selectProcessFile(items, 'Foo');
        assert.equal(res.filePath, 'bpmn/Foo.bpmn');
    });

    it('returns the file name as the path basename', () => {
        const items = [{ path: 'a/b/c/Foo.bpmn', snippet: '<bpmn:process id="Foo">' }];
        const res = CallActivityLocator.selectProcessFile(items, 'Foo');
        assert.equal(res.fileName, 'Foo.bpmn');
    });

    it('ignores non-BPMN hits and keeps the BPMN one', () => {
        const items = [
            { path: 'src/Foo.kt', snippet: 'process id="Foo"' },
            { path: 'bpmn/Foo.bpmn', snippet: '<bpmn:process id="Foo">' }
        ];
        const res = CallActivityLocator.selectProcessFile(items, 'Foo');
        assert.equal(res.filePath, 'bpmn/Foo.bpmn');
    });

    it('prefers the file declaring the process over one merely referencing it', () => {
        const items = [
            // Caller schema: references the process via calledElement, not a declaration.
            { path: 'bpmn/Caller.bpmn', snippet: '<bpmn:callActivity calledElement="Foo" />' },
            // Callee schema: actually declares the process.
            { path: 'bpmn/Foo.bpmn', snippet: '  <bpmn:process id="Foo" isExecutable="true">' }
        ];
        const res = CallActivityLocator.selectProcessFile(items, 'Foo');
        assert.equal(res.filePath, 'bpmn/Foo.bpmn');
    });

    it('matches a declaration without a namespace prefix', () => {
        const items = [
            { path: 'bpmn/Other.bpmn', snippet: '<callActivity calledElement="Foo" />' },
            { path: 'bpmn/Foo.bpmn', snippet: '<process id="Foo">' }
        ];
        const res = CallActivityLocator.selectProcessFile(items, 'Foo');
        assert.equal(res.filePath, 'bpmn/Foo.bpmn');
    });

    it('does not confuse a different process id that shares a prefix', () => {
        const items = [
            { path: 'bpmn/FooBar.bpmn', snippet: '<bpmn:process id="FooBar">' },
            { path: 'bpmn/Foo.bpmn', snippet: '<bpmn:process id="Foo">' }
        ];
        const res = CallActivityLocator.selectProcessFile(items, 'Foo');
        assert.equal(res.filePath, 'bpmn/Foo.bpmn');
    });

    it('falls back to the first BPMN hit when no snippet shows the declaration', () => {
        const items = [
            { path: 'bpmn/First.bpmn', snippet: 'no declaration here' },
            { path: 'bpmn/Second.bpmn', snippet: 'nor here' }
        ];
        const res = CallActivityLocator.selectProcessFile(items, 'Foo');
        assert.equal(res.filePath, 'bpmn/First.bpmn');
    });

    it('tolerates items without a data snippet', () => {
        const items = [{ path: 'bpmn/Foo.bpmn' }];
        const res = CallActivityLocator.selectProcessFile(items, 'Foo');
        assert.equal(res.filePath, 'bpmn/Foo.bpmn');
    });
});

describe('CallActivityLocator.blobSearchPageUrl', () => {
    const locator = new CallActivityLocator(client, null);

    it('builds a blob search page URL for the process id', () => {
        assert.equal(
            locator.blobSearchPageUrl('PrepareItem', 'main'),
            'https://gitlab.example/group/proj/-/search?search=PrepareItem&scope=blobs&ref=main'
        );
    });

    it('url-encodes the process id and ref', () => {
        assert.equal(
            locator.blobSearchPageUrl('Some Process', 'feature/x'),
            'https://gitlab.example/group/proj/-/search?search=Some%20Process&scope=blobs&ref=feature%2Fx'
        );
    });
});
