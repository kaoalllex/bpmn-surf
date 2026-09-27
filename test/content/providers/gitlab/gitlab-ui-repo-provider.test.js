'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

describe('GitLabUIRepoProvider.isAvailable', () => {
    it('handles the gitlab platform kind and nothing else', () => {
        const scope = createScope();
        const provider = new scope.GitLabUIRepoProvider();
        assert.equal(provider.isAvailable(scope.PLATFORM_KIND.GITLAB), true);
        assert.equal(provider.isAvailable(scope.PLATFORM_KIND.GITHUB), false);
        assert.equal(provider.isAvailable(null), false);
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

// The blob header as gitlab.com renders it: GitLab's own button groups inside
// .file-actions. Ours must stand beside them, not inside the first one.
function blobHeaderMarkup() {
    return `
        <div id="fileHolder">
            <div class="js-file-title file-title-flex-parent">
                <div class="file-header-content">root-level.bpmn</div>
                <div class="file-actions gl-flex gl-gap-3">
                    <div class="gl-button-group btn-group js-blob-viewer-switcher"><button>Blame</button></div>
                    <div class="gl-button-group btn-group"><button>Copy</button></div>
                </div>
            </div>
        </div>`;
}

function addBranchButton(scope, fileType = scope.FILE_TYPE_BPMN, onButtonClickFunc = () => {}) {
    const provider = new scope.GitLabUIRepoProvider();
    provider.addButton({ fileType, filePath: 'root-level.bpmn', onButtonClickFunc });
    return provider;
}

const byId = (scope, suffix) => scope.document.getElementById('btn_77844bf3d4e842caa0d88194431197c0' + suffix);

describe('GitLabUIRepoProvider.addButton — branch view', () => {
    it('stands beside GitLab button groups, not inside one', () => {
        const scope = createScope();
        scope.document.body.innerHTML = blobHeaderMarkup();

        addBranchButton(scope);

        const container = byId(scope, '');
        assert.ok(container.parentElement.classList.contains('file-actions'));
        assert.equal(container.parentElement.firstElementChild, container, 'first in the actions');
        assert.equal(container.closest('.js-blob-viewer-switcher'), null);
    });

    it('labels the main button by file type and gives it the icon', () => {
        const scope = createScope();
        scope.document.body.innerHTML = blobHeaderMarkup();

        addBranchButton(scope, scope.FILE_TYPE_DMN);

        assert.equal(byId(scope, '-btn').textContent.trim(), 'View decision');
        assert.ok(byId(scope, '-btn').querySelector('svg'));
        assert.ok(byId(scope, '-btn').classList.contains('bpmn-surf-btn-accent'));
    });

    it('opens the differ on a main-button click', () => {
        const scope = createScope();
        scope.document.body.innerHTML = blobHeaderMarkup();
        let calls = 0;
        addBranchButton(scope, scope.FILE_TYPE_BPMN, () => calls++);

        byId(scope, '-btn').click();

        assert.equal(calls, 1);
    });

    it('keeps "Diff with local file…" in a closed menu under the caret', () => {
        const scope = createScope();
        scope.document.body.innerHTML = blobHeaderMarkup();
        addBranchButton(scope);

        assert.equal(byId(scope, '-menu').hidden, true);
        assert.equal(byId(scope, '-local').textContent, 'Diff with local file…');

        byId(scope, '-caret').click();
        assert.equal(byId(scope, '-menu').hidden, false);
        assert.equal(byId(scope, '-caret').getAttribute('aria-expanded'), 'true');

        byId(scope, '-caret').click();
        assert.equal(byId(scope, '-menu').hidden, true);
    });

    it('picks a local file from the menu item and closes the menu', () => {
        const scope = createScope();
        scope.document.body.innerHTML = blobHeaderMarkup();
        addBranchButton(scope);
        let pickerOpened = 0;
        byId(scope, '-input').addEventListener('click', () => pickerOpened++);

        byId(scope, '-caret').click();
        byId(scope, '-local').click();

        assert.equal(pickerOpened, 1);
        assert.equal(byId(scope, '-menu').hidden, true);
    });

    it('closes the menu on Escape and on a click outside, not on a click inside', () => {
        const scope = createScope();
        scope.document.body.innerHTML = blobHeaderMarkup();
        addBranchButton(scope);
        const { KeyboardEvent, MouseEvent } = scope.window;

        byId(scope, '-caret').click();
        byId(scope, '-menu').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        assert.equal(byId(scope, '-menu').hidden, false, 'a click inside keeps it open');

        scope.document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert.equal(byId(scope, '-menu').hidden, true);

        byId(scope, '-caret').click();
        scope.document.querySelector('.file-header-content')
            .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        assert.equal(byId(scope, '-menu').hidden, true);
    });

    it('reset() removes the button, open menu included, and takes its listeners off the document', () => {
        const scope = createScope();
        scope.document.body.innerHTML = blobHeaderMarkup();
        // Track what is registered on the document: a menu listener that outlives
        // its button would keep reacting to every click on the page.
        const live = new Set();
        const add = scope.document.addEventListener.bind(scope.document);
        const remove = scope.document.removeEventListener.bind(scope.document);
        scope.document.addEventListener = (type, fn, opts) => { live.add(fn); add(type, fn, opts); };
        scope.document.removeEventListener = (type, fn, opts) => { live.delete(fn); remove(type, fn, opts); };
        const provider = addBranchButton(scope);
        byId(scope, '-caret').click();
        assert.equal(live.size, 2, 'the open menu listens for outside clicks and Escape');

        provider.reset();

        assert.equal(byId(scope, ''), null);
        assert.equal(live.size, 0);
        assert.equal(provider.isButtonPresent(), false);
    });

    it('does nothing (and does not throw) without a blob header', () => {
        const scope = createScope();
        scope.document.body.innerHTML = '<div class="unrelated"></div>';

        assert.doesNotThrow(() => addBranchButton(scope));
        assert.equal(byId(scope, ''), null);
    });

    it('is recognised as our own click, caret and menu included', () => {
        const scope = createScope();
        scope.document.body.innerHTML = blobHeaderMarkup();
        const provider = addBranchButton(scope);

        for (const suffix of ['-btn', '-caret', '-local']) {
            assert.equal(provider.isOwnButtonClick({ target: byId(scope, suffix) }), true, suffix);
        }
    });
});
