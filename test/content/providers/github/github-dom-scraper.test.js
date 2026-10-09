'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope, fixture } = require('#scope');

const H = 'a'.repeat(40);
const B = 'b'.repeat(40);
const M = 'c'.repeat(40);

// Classic "Files changed" markup (signed-out / opted-out) as served on
// 2026-10-08, trimmed to what the scraper reads.
function classicBlock(path, oldPath = null) {
    const title = oldPath ? `${oldPath} → ${path}` : path;
    return `<copilot-diff-entry data-file-path="${path}">
      <div class="file js-file">
        <div class="file-header" data-path="${path}" data-file-deleted="false">
          <div class="file-info"><a title="${title}">${title}</a></div>
          <div class="file-actions"><div class="d-flex"><details class="js-file-header-dropdown"></details></div></div>
        </div>
      </div>
    </copilot-diff-entry>`;
}

function classicHeader({ base = 'main', head = 'feature/x', title = 'Add flow' } = {}) {
    return `<bdi class="js-issue-title markdown-title">${title}</bdi>
      <span title="acme/flows:${base}" class="commit-ref css-truncate user-select-contain expandable "><a><span class="css-truncate-target">${base}</span></a></span>
      <span title="acme/flows:${head}" class="commit-ref css-truncate user-select-contain expandable head-ref"><a><span class="css-truncate-target">${head}</span></a></span>
      <include-fragment src="/acme/flows/diffs?base_sha=${B}&amp;bytes=1&amp;pull_number=7&amp;sha1=${M}&amp;sha2=${H}"></include-fragment>`;
}

function blobPage(owner, repo, ref) {
    return `<nav data-testid="breadcrumbs"><ol>
        <li><a data-testid="breadcrumbs-repo-link" href="/${owner}/${repo}/tree/${ref}">${repo}</a></li></ol></nav>
      <div class="react-blob-header-edit-and-raw-actions">
        <div data-component="ButtonGroup"><div><a data-testid="raw-button" href="#">Raw</a></div></div>
      </div>`;
}

// New "Files changed" UI as served signed in on 2026-10-09. Class names are
// hashed per build, so none appear here.
function newUiBlock(digit, path, oldPath = null) {
    const id = `diff-${digit.repeat(64)}`;
    const name = oldPath
        ? `<span aria-hidden="true">\u200e…${path.slice(-12)}\u200e</span><span class="sr-only">${oldPath} renamed to ${path}</span>`
        : `\u200e${path}\u200e`;
    return `<div id="${id}"><div data-diff-header-wrapper="true"><div>
        <h3><a href="#${id}"><code>${name}</code></a></h3>
        <button aria-label="Not Viewed" aria-pressed="false"></button>
        <button aria-haspopup="true" aria-label="More options"></button>
      </div></div></div>`;
}

function newUiPayload(number, viewing = 'FULL', changes = {}) {
    const data = { payload: {
        pullRequestsChangesRoute: {
            comparison: { fullDiff: { baseOid: B, headOid: H }, viewing },
            diffSummaries: [],
            diffContents: [{ oldCommitOid: M, newCommitOid: H }],
            ...changes
        },
        pullRequestsLayoutRoute: { pullRequest: { number, title: 'Add flow', headBranch: 'feature/x', baseBranch: 'main' } }
    } };
    return `<react-app app-name="repo"><script type="application/json" data-target="react-app.embeddedData">${JSON.stringify(data)}</script></react-app>`;
}

function scrape(html) {
    const { document, GitHubDomScraper } = createScope();
    document.body.innerHTML = html;
    return { document, scraper: new GitHubDomScraper() };
}

describe('GitHubDomScraper.fileBlocks — classic', () => {
    it('lists every rendered file with its path, old path and actions container', () => {
        const { document, scraper } = scrape(classicBlock('flows/a.bpmn') + classicBlock('b/moved.dmn', 'a/moved.dmn'));
        const blocks = scraper.fileBlocks(document);
        assert.deepEqual([...blocks].map(b => [b.path, b.oldPath]), [['flows/a.bpmn', null], ['b/moved.dmn', 'a/moved.dmn']]);
        assert.ok(blocks.every(b => b.actions.matches('.file-actions > .d-flex')));
    });

    it('skips a block whose header has not rendered its actions yet', () => {
        const { document, scraper } = scrape(classicBlock('a.bpmn').replace(/<div class="file-actions">.*?<\/div><\/div>/s, ''));
        assert.deepEqual([...scraper.fileBlocks(document)], []);
    });
});

describe('GitHubDomScraper.pullRefs — classic', () => {
    it('reads head, merge base, branch names and title', () => {
        const { document, scraper } = scrape(classicHeader());
        assert.deepEqual({ ...scraper.pullRefs(document, 7) },
            { headSha: H, mergeBaseSha: M, headRef: 'feature/x', baseRef: 'main', title: 'Add flow' });
    });

    it('returns null until the comparison SHAs are on the page', () => {
        const { document, scraper } = scrape(classicHeader().replace(/<include-fragment.*<\/include-fragment>/s, ''));
        assert.equal(scraper.pullRefs(document, 7), null);
    });
});

describe('GitHubDomScraper — new Files changed UI', () => {
    it('lists file blocks with path, old path and the slot before "More options"', () => {
        const { document, scraper } = scrape('<div id="diff-placeholder"></div>' +
            newUiBlock('1', 'flows/a.bpmn') + newUiBlock('2', 'b/moved.dmn', 'a/moved.dmn'));
        const blocks = scraper.fileBlocks(document);
        assert.deepEqual([...blocks].map(b => [b.path, b.oldPath]), [['flows/a.bpmn', null], ['b/moved.dmn', 'a/moved.dmn']]);
        assert.ok(blocks.every(b => b.before.getAttribute('aria-label') === 'More options' && b.before.parentElement === b.actions));
    });

    it('skips a block whose header has not rendered its actions yet', () => {
        const { document, scraper } = scrape(newUiBlock('1', 'a.bpmn').replace(/<button aria-haspopup[^>]*><\/button>/, ''));
        assert.deepEqual([...scraper.fileBlocks(document)], []);
    });

    it('takes the merge base from the file diffs, not the stale base tip', () => {
        const { document, scraper } = scrape(newUiPayload(7));
        assert.deepEqual({ ...scraper.pullRefs(document, 7) },
            { headSha: H, mergeBaseSha: M, headRef: 'feature/x', baseRef: 'main', title: 'Add flow' });
    });

    it('returns null for a payload of another PR or a partial range', () => {
        const other = scrape(newUiPayload(8));
        assert.equal(other.scraper.pullRefs(other.document, 7), null);
        const range = scrape(newUiPayload(7, 'RANGE'));
        assert.equal(range.scraper.pullRefs(range.document, 7), null);
    });
});

// A large PR embeds its file list but no file diffs: GitHub loads each one from
// page_data/diff_entries as it scrolls into view.
describe('GitHubDomScraper — a large PR with lazily loaded diffs', () => {
    const LAZY = { diffContents: [], diffSummaries: [{ path: 'big.js', linesChanged: 900 }, { path: 'flows/a.bpmn', linesChanged: 3 }] };

    it('names the smallest file to load when the page embeds no file diffs', () => {
        const { document, scraper } = scrape(newUiPayload(7, 'FULL', LAZY));
        assert.equal(scraper.pullRefs(document, 7), null);
        assert.deepEqual({ ...scraper.lazyDiffEntry(document, 7) }, { path: 'flows/a.bpmn', headSha: H });
    });

    it('reads the refs from the loaded file diffs', () => {
        const { document, scraper } = scrape(newUiPayload(7, 'FULL', LAZY));
        assert.deepEqual({ ...scraper.pullRefs(document, 7, [{ oldCommitOid: M, newCommitOid: H }]) },
            { headSha: H, mergeBaseSha: M, headRef: 'feature/x', baseRef: 'main', title: 'Add flow' });
    });

    it('names nothing when the diffs are embedded, for another PR or a partial range', () => {
        for (const [html, number] of [[newUiPayload(7), 7], [newUiPayload(8, 'FULL', LAZY), 7], [newUiPayload(7, 'RANGE', LAZY), 7]]) {
            const { document, scraper } = scrape(html);
            assert.equal(scraper.lazyDiffEntry(document, number), null);
        }
    });
});

describe('GitHubDomScraper — new UI captures', () => {
    it('reads sandbox #7 (rename) as GitHub diffs it', () => {
        const { document, scraper } = scrape(fixture('github/pr-changes-new-ui.html'));
        const refs = scraper.pullRefs(document, 7);
        assert.equal(refs.mergeBaseSha, '276bf8af3be77a7e93a999922234f9eae75d5726');
        assert.equal(refs.headSha, '1dbe0b175b7d4cef7f2fd56cadf5c9bc5cc3fd95');
        const bpmn = [...scraper.fileBlocks(document)].filter(b => b.path.endsWith('.bpmn'));
        assert.deepEqual(bpmn.map(b => [b.path, b.oldPath]), [[
            'order-service/src/main/resources/bpmn/order/fulfillment/LastMileDelivery.bpmn',
            'order-service/src/main/resources/bpmn/order/fulfillment/Delivery.bpmn'
        ]]);
        // The real "More options" has no aria-label, so it must be found by aria-haspopup.
        assert.ok(bpmn[0].before.matches('button[aria-haspopup="true"]'));
        assert.equal(bpmn[0].before.parentElement, bpmn[0].actions);
    });

    it('has no refs after a soft navigation from the Conversation tab', () => {
        const { document, scraper } = scrape(fixture('github/pr-changes-new-ui-stale.html'));
        assert.equal(scraper.pullRefs(document, 16), null);
    });
});

describe('GitHubDomScraper — classic capture', () => {
    it('agrees with the hand-built markup on a real page', () => {
        const { document, scraper } = scrape(fixture('github/pr-files-classic.html'));
        assert.ok(scraper.fileBlocks(document).length >= 1);
        // Sandbox #9 after main moved ahead: sha1 is the merge base, not main's tip.
        assert.equal(scraper.pullRefs(document, 9).mergeBaseSha, '276bf8af3be77a7e93a999922234f9eae75d5726');
        assert.equal(scraper.pullRefs(document, 9).headSha, '69e462e326cc41e1e60b1ba505e18c35355a6ce1');
    });
});

describe('GitHubDomScraper — blob', () => {
    it('reads a slashed ref from the breadcrumbs repo link', () => {
        const { document, scraper } = scrape(blobPage('acme', 'flows', 'feature/x%2Fy'));
        assert.equal(scraper.findBlobRef(document, 'acme', 'flows'), 'feature/x/y');
    });

    it('ignores a breadcrumbs link of another repository', () => {
        const { document, scraper } = scrape(blobPage('other', 'repo', 'main'));
        assert.equal(scraper.findBlobRef(document, 'acme', 'flows'), null);
    });

    it('finds the Raw button group as the blob button anchor', () => {
        const { document, scraper } = scrape(blobPage('acme', 'flows', 'main'));
        assert.equal(scraper.blobActionsAnchor(document).getAttribute('data-component'), 'ButtonGroup');
    });
});
