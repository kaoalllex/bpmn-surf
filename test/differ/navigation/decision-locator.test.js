'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { DecisionLocator, GitLabPlatformClient } = createScope();

// A GitLab client over a fixed project, so blobSearchPageUrl asserts the real
// URL format the locator now delegates to (REFAC-0004).
const client = new GitLabPlatformClient({
    projectUrl: 'https://gitlab.example/group/proj',
    hostUrl: 'https://gitlab.example',
    projectId: 42
});

describe('DecisionLocator.isDmnFile', () => {
    it('accepts DMN files', () => {
        assert.equal(DecisionLocator.isDmnFile('src/main/resources/dmn/ScoreCar.dmn'), true);
    });

    it('rejects non-DMN files', () => {
        assert.equal(DecisionLocator.isDmnFile('bpmn/PrepareItem.bpmn'), false);
        assert.equal(DecisionLocator.isDmnFile('README.md'), false);
    });

    it('rejects empty or null paths', () => {
        assert.equal(DecisionLocator.isDmnFile(''), false);
        assert.equal(DecisionLocator.isDmnFile(null), false);
        assert.equal(DecisionLocator.isDmnFile(undefined), false);
    });
});

describe('DecisionLocator.selectDecisionFile', () => {
    it('returns null when items is not an array', () => {
        assert.equal(DecisionLocator.selectDecisionFile(null, 'Foo'), null);
        assert.equal(DecisionLocator.selectDecisionFile(undefined, 'Foo'), null);
    });

    it('returns null for an empty list', () => {
        assert.equal(DecisionLocator.selectDecisionFile([], 'Foo'), null);
    });

    it('returns null when no item is a DMN file', () => {
        const items = [
            { path: 'src/Foo.kt', snippet: 'decision id="Foo"' },
            { path: 'README.md', snippet: 'decision id="Foo"' }
        ];
        assert.equal(DecisionLocator.selectDecisionFile(items, 'Foo'), null);
    });

    it('selects the only DMN hit', () => {
        const items = [{ path: 'dmn/Foo.dmn', snippet: '<decision id="Foo">' }];
        const res = DecisionLocator.selectDecisionFile(items, 'Foo');
        assert.equal(res.filePath, 'dmn/Foo.dmn');
    });

    it('returns the file name as the path basename', () => {
        const items = [{ path: 'a/b/c/Foo.dmn', snippet: '<decision id="Foo">' }];
        const res = DecisionLocator.selectDecisionFile(items, 'Foo');
        assert.equal(res.fileName, 'Foo.dmn');
    });

    it('ignores non-DMN hits and keeps the DMN one', () => {
        const items = [
            { path: 'src/Foo.kt', snippet: 'decision id="Foo"' },
            { path: 'dmn/Foo.dmn', snippet: '<decision id="Foo">' }
        ];
        const res = DecisionLocator.selectDecisionFile(items, 'Foo');
        assert.equal(res.filePath, 'dmn/Foo.dmn');
    });

    it('prefers the file declaring the decision over one merely referencing it', () => {
        const items = [
            // A DMN that references the decision elsewhere (no declaration snippet).
            { path: 'dmn/Other.dmn', snippet: 'requiredDecision href="#Foo"' },
            // The file that actually declares the decision.
            { path: 'dmn/Foo.dmn', snippet: '  <decision id="Foo" name="Score">' }
        ];
        const res = DecisionLocator.selectDecisionFile(items, 'Foo');
        assert.equal(res.filePath, 'dmn/Foo.dmn');
    });

    it('does not confuse a different decision id that shares a prefix', () => {
        const items = [
            { path: 'dmn/FooBar.dmn', snippet: '<decision id="FooBar">' },
            { path: 'dmn/Foo.dmn', snippet: '<decision id="Foo">' }
        ];
        const res = DecisionLocator.selectDecisionFile(items, 'Foo');
        assert.equal(res.filePath, 'dmn/Foo.dmn');
    });

    it('falls back to the first DMN hit when no snippet shows the declaration', () => {
        const items = [
            { path: 'dmn/First.dmn', snippet: 'no declaration here' },
            { path: 'dmn/Second.dmn', snippet: 'nor here' }
        ];
        const res = DecisionLocator.selectDecisionFile(items, 'Foo');
        assert.equal(res.filePath, 'dmn/First.dmn');
    });

    it('tolerates items without a data snippet', () => {
        const items = [{ path: 'dmn/Foo.dmn' }];
        const res = DecisionLocator.selectDecisionFile(items, 'Foo');
        assert.equal(res.filePath, 'dmn/Foo.dmn');
    });
});

describe('DecisionLocator.blobSearchPageUrl', () => {
    const locator = new DecisionLocator(client);

    it('builds a blob search page URL for the decision id', () => {
        assert.equal(
            locator.blobSearchPageUrl('ScoreCar', 'main'),
            'https://gitlab.example/group/proj/-/search?search=ScoreCar&scope=blobs&ref=main'
        );
    });

    it('url-encodes the decision id and ref', () => {
        assert.equal(
            locator.blobSearchPageUrl('Some Decision', 'feature/x'),
            'https://gitlab.example/group/proj/-/search?search=Some%20Decision&scope=blobs&ref=feature%2Fx'
        );
    });
});

describe('DecisionLocator.resolveDecisionFile (guards, no network)', () => {
    const locator = new DecisionLocator(client);

    it('returns null for an empty decision id', async () => {
        assert.equal(await locator.resolveDecisionFile('', 'main'), null);
        assert.equal(await locator.resolveDecisionFile(null, 'main'), null);
    });
});
