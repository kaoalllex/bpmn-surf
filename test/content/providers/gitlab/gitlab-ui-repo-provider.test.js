'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

// GitLabUIRepoProvider.addButton works on the realm's global document, so each
// test gets a fresh scope with the relevant MR header markup.

// GitLab.com renders the MR sticky header inside .merge-request-sticky-header-wrapper.
function gitlabComHeaderMarkup() {
    return `
        <main id="content-body">
            <div class="merge-request">
                <div class="merge-request-details issuable-details">
                    <div class="merge-request-sticky-header-wrapper js-merge-request-sticky-header-wrapper">
                        <div class="merge-request-sticky-header gl-border-b">
                            <div class="merge-request-tabs-container gl-flex gl-justify-between gl-relative gl-gap-2 is-merge-request js-tabs-affix">
                                <ul class="merge-request-tabs"></ul>
                                <div class="merge-request-tabs-actions"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>`;
}

// Self-managed GitLab (gitlab.example.com): sticky header is a direct child of issuable-details.
function selfManagedHeaderMarkup() {
    return `
        <main id="content-body">
            <div class="merge-request">
                <div class="merge-request-details issuable-details">
                    <div class="merge-request-sticky-header gl-border-b">
                        <div class="merge-request-tabs-container gl-flex gl-justify-between gl-relative is-merge-request js-tabs-affix">
                            <ul class="merge-request-tabs"></ul>
                            <div class="merge-request-tabs-actions"></div>
                        </div>
                    </div>
                </div>
            </div>
        </main>`;
}

// GitLab renders the .is-merge-request marker only when the user's "Layout width"
// preference is Fixed, so with Fluid layout the tabs container has no such class.
function fluidLayoutHeaderMarkup() {
    return `
        <main id="content-body">
            <div class="merge-request">
                <div class="merge-request-details issuable-details">
                    <div class="merge-request-sticky-header-wrapper js-merge-request-sticky-header-wrapper">
                        <div class="merge-request-sticky-header gl-border-b">
                            <div class="merge-request-tabs-container gl-flex gl-justify-between gl-relative gl-gap-2 js-tabs-affix">
                                <ul class="merge-request-tabs"></ul>
                                <div class="merge-request-tabs-actions"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>`;
}

function addDiffButton(scope, fileType) {
    const provider = new scope.GitLabUIRepoProvider();
    provider.addButton({
        fileType,
        buttonType: scope.UI_BUTTON_TYPE.DIFF,
        needToSelectLocalFile: false,
        onButtonClickFunc: () => {}
    });
    return provider;
}

function diffButton(document) {
    return [...document.querySelectorAll('button')]
        .find(b => b.textContent === 'Schema diff' || b.textContent === 'Decision diff');
}

describe('GitLabUIRepoProvider.isAvailable', () => {
    it('handles the gitlab platform kind and nothing else', () => {
        const scope = createScope();
        const provider = new scope.GitLabUIRepoProvider();
        assert.equal(provider.isAvailable(scope.PLATFORM_KIND.GITLAB), true);
        assert.equal(provider.isAvailable(scope.PLATFORM_KIND.GITHUB), false);
        assert.equal(provider.isAvailable(null), false);
    });
});

describe('GitLabUIRepoProvider.addButton — DIFF', () => {
    it('inserts the button into the gitlab.com header (wrapped sticky header)', () => {
        const scope = createScope();
        scope.document.body.innerHTML = gitlabComHeaderMarkup();

        addDiffButton(scope, scope.FILE_TYPE_BPMN);

        const button = diffButton(scope.document);
        assert.ok(button, 'button should be inserted');
        assert.equal(button.textContent, 'Schema diff');
        assert.ok(
            button.closest('.merge-request-tabs-actions'),
            'button should live inside the tabs-actions container'
        );
    });

    it('inserts the button into the self-managed header (direct sticky header)', () => {
        const scope = createScope();
        scope.document.body.innerHTML = selfManagedHeaderMarkup();

        addDiffButton(scope, scope.FILE_TYPE_BPMN);

        const button = diffButton(scope.document);
        assert.ok(button, 'button should be inserted');
        assert.ok(button.closest('.merge-request-tabs-actions'));
    });

    it('inserts the button into the fluid-layout header (no .is-merge-request marker)', () => {
        const scope = createScope();
        scope.document.body.innerHTML = fluidLayoutHeaderMarkup();

        addDiffButton(scope, scope.FILE_TYPE_BPMN);

        const button = diffButton(scope.document);
        assert.ok(button, 'button should be inserted');
        assert.ok(button.closest('.merge-request-tabs-actions'));
    });

    it('labels the button "Decision diff" for DMN', () => {
        const scope = createScope();
        scope.document.body.innerHTML = gitlabComHeaderMarkup();

        addDiffButton(scope, scope.FILE_TYPE_DMN);

        assert.equal(diffButton(scope.document).textContent, 'Decision diff');
    });

    it('does nothing (and does not throw) when no known container is present', () => {
        const scope = createScope();
        scope.document.body.innerHTML = '<div class="unrelated"></div>';

        assert.doesNotThrow(() => addDiffButton(scope, scope.FILE_TYPE_BPMN));
        assert.equal(diffButton(scope.document), undefined);
    });
});

describe('GitLabUIRepoProvider disable/enable', () => {
    it('disables and re-enables the button in place, without removing it', () => {
        const scope = createScope();
        scope.document.body.innerHTML = gitlabComHeaderMarkup();
        const provider = addDiffButton(scope, scope.FILE_TYPE_BPMN);

        provider.disableButton();
        assert.equal(diffButton(scope.document).disabled, true);

        provider.enableButton();
        assert.equal(diffButton(scope.document).disabled, false);
        assert.ok(diffButton(scope.document), 'button should still be the same element, not rebuilt');
    });

    it('does nothing (and does not throw) when there is no button', () => {
        const scope = createScope();
        scope.document.body.innerHTML = gitlabComHeaderMarkup();
        const provider = new scope.GitLabUIRepoProvider();

        assert.doesNotThrow(() => provider.disableButton());
        assert.doesNotThrow(() => provider.enableButton());
    });
});

// File blocks as the two diff UIs render them (trimmed from the live pages).
// Rapid diffs (gitlab.com): data-file-data is an entity-escaped JSON string; the
// last child of .rd-diff-file-info is the ⋮ options menu.
function rapidBlock(data) {
    const escaped = JSON.stringify(data).replace(/"/g, '&quot;');
    return `
        <diff-file class="rd-diff-file-component" data-file-data="${escaped}">
            <div class="rd-diff-file-header-sticky">
                <header class="rd-diff-file-header">
                    <div class="rd-diff-file-header-main"><h2>${data.new_path || data.old_path}</h2></div>
                    <div class="rd-diff-file-info">
                        <div class="rd-diff-file-stats">+1 −1</div>
                        <div class="options-menu">⋮</div>
                    </div>
                </header>
            </div>
        </diff-file>`;
}

// Legacy Vue diffs (self-managed): the header's own .file-actions ends with the
// ⋮ menu; the diff body may hold other .file-actions that are not ours to touch.
function legacyBlock(path) {
    return `
        <div class="diff-file file-holder" data-path="${path}">
            <div class="js-file-title file-title file-title-flex-parent">
                <div class="file-header-content"><strong>${path}</strong></div>
                <div class="file-actions">
                    <div class="diff-stats">+1 −1</div>
                    <div class="options-menu">⋮</div>
                </div>
            </div>
            <div class="diff-content"><div class="file-actions body-trap"></div></div>
        </div>`;
}

function describeDiagrams(scope, clicks = []) {
    const detector = new scope.FileTypeDetector();
    return filePath => {
        const fileType = detector.detect(filePath);
        return fileType ? { fileType, onButtonClickFunc: () => clicks.push(filePath) } : null;
    };
}

const fileButtons = document => [...document.querySelectorAll('.bpmn-surf-file-btn')];

describe('GitLabUIRepoProvider.syncFileButtons', () => {
    it('puts one button on every rapid-diffs diagram block, before the options menu', () => {
        const scope = createScope();
        scope.document.body.innerHTML =
            rapidBlock({ new_path: 'a/Process.bpmn' }) +
            rapidBlock({ new_path: 'src/Service.java' }) +
            rapidBlock({ new_path: 'b/Risk.dmn' });

        new scope.GitLabUIRepoProvider().syncFileButtons(describeDiagrams(scope));

        const buttons = fileButtons(scope.document);
        assert.deepEqual(buttons.map(b => b.dataset.bpmnSurfFilePath), ['a/Process.bpmn', 'b/Risk.dmn']);
        assert.deepEqual(buttons.map(b => b.textContent.trim()), ['Schema diff', 'Decision diff']);
        for (const b of buttons) {
            assert.ok(b.parentElement.classList.contains('rd-diff-file-info'));
            assert.ok(b.nextElementSibling.classList.contains('options-menu'), 'right before ⋮');
            assert.ok(b.querySelector('svg'), 'carries the bpmn-surf icon');
        }
    });

    it('puts one button on every legacy diagram block, in the header only', () => {
        const scope = createScope();
        scope.document.body.innerHTML = legacyBlock('a/Process.bpmn') + legacyBlock('docs/readme.md');

        new scope.GitLabUIRepoProvider().syncFileButtons(describeDiagrams(scope));

        const buttons = fileButtons(scope.document);
        assert.equal(buttons.length, 1);
        assert.ok(buttons[0].closest('.js-file-title'), 'in the header, not in the diff body');
        assert.ok(buttons[0].nextElementSibling.classList.contains('options-menu'));
        assert.equal(scope.document.querySelector('.body-trap').children.length, 0);
    });

    it('uses old_path for a deleted rapid-diffs file', () => {
        const scope = createScope();
        scope.document.body.innerHTML = rapidBlock({ old_path: 'gone/Old.bpmn' });

        new scope.GitLabUIRepoProvider().syncFileButtons(describeDiagrams(scope));

        assert.equal(fileButtons(scope.document)[0].dataset.bpmnSurfFilePath, 'gone/Old.bpmn');
    });

    it('skips a block with unreadable data-file-data and still serves the rest', () => {
        const scope = createScope();
        scope.document.body.innerHTML =
            '<diff-file data-file-data="{not-json"><div class="rd-diff-file-info"><div></div></div></diff-file>' +
            rapidBlock({ new_path: 'a.bpmn' });

        assert.doesNotThrow(() => new scope.GitLabUIRepoProvider().syncFileButtons(describeDiagrams(scope)));
        assert.equal(fileButtons(scope.document).length, 1);
    });

    it('skips a block without an actions area', () => {
        const scope = createScope();
        scope.document.body.innerHTML =
            '<div class="diff-file file-holder" data-path="big.bpmn"><div class="js-file-title"></div></div>' +
            legacyBlock('ok.bpmn');

        assert.doesNotThrow(() => new scope.GitLabUIRepoProvider().syncFileButtons(describeDiagrams(scope)));
        assert.deepEqual(fileButtons(scope.document).map(b => b.dataset.bpmnSurfFilePath), ['ok.bpmn']);
    });

    it('changes nothing in the DOM when every block already has its button', () => {
        const scope = createScope();
        scope.document.body.innerHTML = rapidBlock({ new_path: 'a.bpmn' }) + legacyBlock('b.dmn');
        const provider = new scope.GitLabUIRepoProvider();
        provider.syncFileButtons(describeDiagrams(scope));

        // The observer that calls this reacts to DOM changes: a second pass that
        // mutated anything would keep it firing forever.
        const observer = new scope.window.MutationObserver(() => {});
        observer.observe(scope.document.body, { childList: true, subtree: true, attributes: true });
        provider.syncFileButtons(describeDiagrams(scope));
        assert.equal(observer.takeRecords().length, 0);
        observer.disconnect();
    });

    it('keeps an exotic path stable across syncs', () => {
        const scope = createScope();
        const path = 'dir with space/Процесс "v2" & co.bpmn';
        scope.document.body.innerHTML = rapidBlock({ new_path: path });
        const provider = new scope.GitLabUIRepoProvider();
        provider.syncFileButtons(describeDiagrams(scope));
        const first = fileButtons(scope.document)[0];

        provider.syncFileButtons(describeDiagrams(scope));

        assert.equal(first.dataset.bpmnSurfFilePath, path);
        assert.equal(fileButtons(scope.document)[0], first, 'same element, not rebuilt');
    });

    it('replaces a button that belongs to another file than its block', () => {
        const scope = createScope();
        scope.document.body.innerHTML = legacyBlock('a.bpmn');
        const provider = new scope.GitLabUIRepoProvider();
        provider.syncFileButtons(describeDiagrams(scope));
        // A recycled block: GitLab reused the element for another file.
        scope.document.querySelector('.diff-file').setAttribute('data-path', 'b.dmn');

        provider.syncFileButtons(describeDiagrams(scope));

        const buttons = fileButtons(scope.document);
        assert.equal(buttons.length, 1);
        assert.equal(buttons[0].dataset.bpmnSurfFilePath, 'b.dmn');
        assert.equal(buttons[0].textContent.trim(), 'Decision diff');
    });

    it('calls the handler of its own file on click', () => {
        const scope = createScope();
        scope.document.body.innerHTML = legacyBlock('a.bpmn') + legacyBlock('b.bpmn');
        const clicks = [];
        new scope.GitLabUIRepoProvider().syncFileButtons(describeDiagrams(scope, clicks));

        fileButtons(scope.document)[1].querySelector('button').click();

        assert.deepEqual(clicks, ['b.bpmn']);
    });

    it('does not let the click reach the header', () => {
        const scope = createScope();
        scope.document.body.innerHTML = legacyBlock('a.bpmn');
        new scope.GitLabUIRepoProvider().syncFileButtons(describeDiagrams(scope));
        let headerClicks = 0;
        scope.document.querySelector('.js-file-title').addEventListener('click', () => headerClicks++);

        fileButtons(scope.document)[0].querySelector('button').click();

        assert.equal(headerClicks, 0);
    });
});

describe('GitLabUIRepoProvider.removeFileButtons', () => {
    it('removes every file button', () => {
        const scope = createScope();
        scope.document.body.innerHTML = rapidBlock({ new_path: 'a.bpmn' }) + legacyBlock('b.bpmn');
        const provider = new scope.GitLabUIRepoProvider();
        provider.syncFileButtons(describeDiagrams(scope));

        provider.removeFileButtons();

        assert.equal(fileButtons(scope.document).length, 0);
    });
});

describe('GitLabUIRepoProvider.isOwnButtonClick', () => {
    it('recognises a click anywhere inside a file button, icon included', () => {
        const scope = createScope();
        scope.document.body.innerHTML = rapidBlock({ new_path: 'a.bpmn' });
        const provider = new scope.GitLabUIRepoProvider();
        provider.syncFileButtons(describeDiagrams(scope));

        const icon = fileButtons(scope.document)[0].querySelector('svg');
        assert.equal(provider.isOwnButtonClick({ target: icon }), true);
    });

    it('does not claim clicks elsewhere or without a target', () => {
        const scope = createScope();
        scope.document.body.innerHTML = rapidBlock({ new_path: 'a.bpmn' });
        const provider = new scope.GitLabUIRepoProvider();

        assert.equal(provider.isOwnButtonClick({ target: scope.document.querySelector('h2') }), false);
        assert.equal(provider.isOwnButtonClick(null), false);
        assert.equal(provider.isOwnButtonClick({ target: null }), false);
    });
});
