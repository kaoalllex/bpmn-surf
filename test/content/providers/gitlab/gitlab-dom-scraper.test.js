'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

// GitLabDomScraper reads the realm's global document/window, so each test gets a
// fresh scope and sets up the markup on it.
function createScraper(opts) {
    const scope = createScope(opts);
    return { scope, scraper: new scope.GitLabDomScraper() };
}

describe('GitLabDomScraper.findSelectedFilePath — legacy UI', () => {
    it('returns the path of the active data-path element', async () => {
        const { scope, scraper } = createScraper();
        scope.document.body.innerHTML = `
            <div data-path="a.bpmn"></div>
            <div data-path="b.bpmn" class="is-active"></div>`;
        assert.equal(await scraper.findSelectedFilePath(), 'b.bpmn');
    });

    it('returns null when no data-path element is active', async () => {
        const { scope, scraper } = createScraper();
        scope.document.body.innerHTML = `<div data-path="a.bpmn"></div>`;
        assert.equal(await scraper.findSelectedFilePath(), null);
    });
});

const diffFile = (path, id) =>
    `<diff-file${id ? ` id="${id}"` : ''} data-file-data='${JSON.stringify({ new_path: path })}'></diff-file>`;

describe('GitLabDomScraper.findSelectedFilePath — rapid diffs', () => {
    it('picks the file the url hash points at', async () => {
        const { scope, scraper } = createScraper();
        scope.document.body.innerHTML = diffFile('a.bpmn', 'f1') + diffFile('b.bpmn', 'f2');
        scope.window.location.hash = '#f2';
        assert.equal(await scraper.findSelectedFilePath(), 'b.bpmn');
    });

    it('falls back to the only diagram in the diff', async () => {
        const { scope, scraper } = createScraper();
        scope.document.body.innerHTML = diffFile('Service.java') + diffFile('a.bpmn');
        assert.equal(await scraper.findSelectedFilePath(), 'a.bpmn');
    });

    it('keeps the last answer while no file element is rendered (BUG-0036)', async () => {
        const { scope, scraper } = createScraper();
        scope.document.body.innerHTML = diffFile('a.bpmn');
        assert.equal(await scraper.findSelectedFilePath(), 'a.bpmn');

        // Rapid diffs unmounts file elements as the reader scrolls. An empty DOM
        // says "not rendered now", not "not in this diff" — answering null here
        // is what made the button blink.
        scope.document.body.innerHTML = '';
        assert.equal(await scraper.findSelectedFilePath(), 'a.bpmn');
    });

    it('does drop the answer once rendered files hold no diagram', async () => {
        const { scope, scraper } = createScraper();
        scope.document.body.innerHTML = diffFile('a.bpmn');
        assert.equal(await scraper.findSelectedFilePath(), 'a.bpmn');

        scope.document.body.innerHTML = diffFile('Service.java');
        assert.equal(await scraper.findSelectedFilePath(), null);
    });

    it('returns null when several diagrams are rendered and none is selected', async () => {
        const { scope, scraper } = createScraper();
        scope.document.body.innerHTML = diffFile('a.bpmn') + diffFile('b.dmn');
        assert.equal(await scraper.findSelectedFilePath(), null);
    });
});

describe('GitLabDomScraper.findBranchCommitIdText', () => {
    // Production reads .innerText (a Chrome feature jsdom does not implement),
    // so the text node is attached as an explicit innerText property here.
    function appendRef(scope, containerHtml, textElemSelector, text) {
        scope.document.body.innerHTML = containerHtml;
        scope.document.querySelector(textElemSelector).innerText = text;
    }

    it('reads the ref text from the gl ref-selector (case 1)', () => {
        const { scope, scraper } = createScraper();
        appendRef(
            scope,
            `<div class="ref-selector"><span class="gl-dropdown-button-text"></span></div>`,
            '.gl-dropdown-button-text',
            'feature/x'
        );
        assert.equal(scraper.findBranchCommitIdText(), 'feature/x');
    });

    it('reads the ref text from the legacy refs-dropdown (case 2)', () => {
        const { scope, scraper } = createScraper();
        appendRef(
            scope,
            `<button class="js-project-refs-dropdown"><span class="dropdown-toggle-text"></span></button>`,
            '.dropdown-toggle-text',
            'master'
        );
        assert.equal(scraper.findBranchCommitIdText(), 'master');
    });

    it('returns null when no ref selector is present', () => {
        const { scraper } = createScraper();
        assert.equal(scraper.findBranchCommitIdText(), null);
    });
});

describe('GitLabDomScraper.getMergeRequestBranchNames', () => {
    it('reads source and target branch names around the "into" text node', () => {
        const { scope, scraper } = createScraper();
        scope.document.body.innerHTML = `
            <div class="detail-page-description">
                <a>feature/x</a> into <a>main</a>
            </div>`;
        const names = scraper.getMergeRequestBranchNames();
        assert.equal(names.sourceBranchName, 'feature/x');
        assert.equal(names.targetBranchName, 'main');
    });

    it('returns null when the description element is absent', () => {
        const { scraper } = createScraper();
        assert.equal(scraper.getMergeRequestBranchNames(), null);
    });
});

describe('GitLabDomScraper.findDiffHeadSha', () => {
    it('extracts diff_head_sha from the discussions data attribute', () => {
        const { scope, scraper } = createScraper();
        const sha = '34c4db57af7d31f72ca22abfb1d462eb4a87dd2e';
        scope.document.body.innerHTML =
            `<div id="js-vue-mr-discussions" data-noteable-data='{"diff_head_sha":"${sha}"}'></div>`;
        assert.equal(scraper.findDiffHeadSha(), sha);
    });

    it('returns null when the discussions element is absent', () => {
        const { scraper } = createScraper();
        assert.equal(scraper.findDiffHeadSha(), null);
    });

    it('returns null when the attribute has no diff_head_sha', () => {
        const { scope, scraper } = createScraper();
        scope.document.body.innerHTML =
            `<div id="js-vue-mr-discussions" data-noteable-data='{"other":"x"}'></div>`;
        assert.equal(scraper.findDiffHeadSha(), null);
    });
});

describe('GitLabDomScraper.isMergedByBadge', () => {
    it('is true when the merged status badge says "Merged"', () => {
        const { scope, scraper } = createScraper();
        scope.document.body.innerHTML = `
            <span class="issuable-status-badge-merged">
                <span class="gl-display-none gl-sm-display-block">Merged</span>
            </span>`;
        assert.equal(scraper.isMergedByBadge(), true);
    });

    it('is false when the badge text is not "Merged"', () => {
        const { scope, scraper } = createScraper();
        scope.document.body.innerHTML = `
            <span class="issuable-status-badge-merged">
                <span class="gl-display-none gl-sm-display-block">Open</span>
            </span>`;
        assert.equal(scraper.isMergedByBadge(), false);
    });

    it('is false when there is no merged badge', () => {
        const { scraper } = createScraper();
        assert.equal(scraper.isMergedByBadge(), false);
    });
});
