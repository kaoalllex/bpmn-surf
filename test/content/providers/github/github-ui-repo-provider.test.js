'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

function setup(html, blocks) {
    const scope = createScope({ url: 'https://github.com/acme/flows/pull/42/files' });
    scope.document.body.innerHTML = html;
    const scraper = {
        fileBlocks: () => blocks ? blocks(scope.document) : [],
        blobActionsAnchor: (doc) => doc.querySelector('[data-component="ButtonGroup"]')
    };
    return { scope, ui: new scope.GitHubUIRepoProvider(scraper) };
}

const TWO_FILES = '<div id="a"><div class="act"><details></details></div></div><div id="p"><div class="act"></div></div><div id="d"><div class="act"></div></div>';
const blocksOf = (doc) => [
    { path: 'a.bpmn', actions: doc.querySelector('#a .act'), before: null },
    { path: 'pom.xml', actions: doc.querySelector('#p .act'), before: null },
    { path: 'd.dmn', actions: doc.querySelector('#d .act'), before: null }
];

function describeFile(scope) {
    return (path) => {
        const fileType = new scope.FileTypeDetector().detect(path);
        return fileType ? { fileType, onButtonClickFunc: () => {} } : null;
    };
}

describe('GitHubUIRepoProvider — PR files', () => {
    it('adds one diff button per diagram file, idempotently', () => {
        const { scope, ui } = setup(TWO_FILES, blocksOf);
        ui.syncFileButtons(describeFile(scope));
        ui.syncFileButtons(describeFile(scope));
        const buttons = [...scope.document.querySelectorAll('.bpmn-surf-file-btn')];
        assert.deepEqual(buttons.map(b => [b.dataset.bpmnSurfFilePath, b.textContent]),
            [['a.bpmn', 'Schema diff'], ['d.dmn', 'Decision diff']]);
    });

    it('puts the button first in the classic actions row', () => {
        const { scope, ui } = setup(TWO_FILES, blocksOf);
        ui.syncFileButtons(describeFile(scope));
        const actions = scope.document.querySelector('#a .act');
        assert.equal(actions.firstElementChild.classList.contains('bpmn-surf-file-btn'), true);
    });

    it('puts the button immediately before "More options" in the new UI', () => {
        const html = '<div id="a"><div class="act"><span id="x"></span><button id="more">More options</button></div></div>';
        const { scope, ui } = setup(html, (doc) => [
            { path: 'a.bpmn', actions: doc.querySelector('.act'), before: doc.querySelector('#more') }
        ]);
        ui.syncFileButtons(describeFile(scope));
        const more = scope.document.querySelector('#more');
        assert.equal(more.previousElementSibling.classList.contains('bpmn-surf-file-btn'), true);
        assert.equal(more.previousElementSibling.previousElementSibling.id, 'x');
    });

    it('opens the diff on click, without toggling the file, and claims the click', () => {
        const { scope, ui } = setup(TWO_FILES, blocksOf);
        let opened = 0;
        ui.syncFileButtons((path) => path === 'a.bpmn' ? { fileType: scope.FILE_TYPE_BPMN, onButtonClickFunc: () => { opened++; } } : null);
        let toggled = 0;
        scope.document.querySelector('#a').addEventListener('click', () => { toggled++; });
        const button = scope.document.querySelector('.bpmn-surf-file-btn button');
        button.click();
        assert.equal(opened, 1);
        assert.equal(toggled, 0);
        assert.equal(ui.isOwnButtonClick({ target: button }), true);
    });

    it('removes every file button', () => {
        const { scope, ui } = setup(TWO_FILES, blocksOf);
        ui.syncFileButtons(describeFile(scope));
        ui.removeFileButtons();
        assert.equal(scope.document.querySelectorAll('.bpmn-surf-file-btn').length, 0);
    });
});

describe('GitHubUIRepoProvider — blob', () => {
    const BLOB = '<div class="react-blob-header-edit-and-raw-actions"><div data-component="ButtonGroup"><a data-testid="raw-button" href="#">Raw</a></div></div>';

    it('puts the view split button before the Raw group and remembers its file', () => {
        const { scope, ui } = setup(BLOB);
        ui.addButton({ fileType: scope.FILE_TYPE_DMN, filePath: 'd/x.dmn', onButtonClickFunc: () => {} });
        const group = scope.document.querySelector('[data-component="ButtonGroup"]');
        assert.match(group.previousElementSibling.textContent, /View decision/);
        assert.equal(ui.isButtonPresent(), true);
        assert.equal(ui.buttonFilePath(), 'd/x.dmn');
        ui.reset();
        assert.equal(ui.isButtonPresent(), false);
    });

    it('offers "Diff with local file…" from the caret', () => {
        const { scope, ui } = setup(BLOB);
        ui.addButton({ fileType: scope.FILE_TYPE_BPMN, filePath: 'a.bpmn', onButtonClickFunc: () => {} });
        const caret = scope.document.querySelector('[aria-haspopup="menu"]');
        caret.click();
        const menu = scope.document.querySelector('[role="menu"]');
        assert.equal(menu.hidden, false);
        assert.match(menu.textContent, /Diff with local file/);
    });

    it('does nothing when the header has not rendered', () => {
        const { scope, ui } = setup('');
        ui.addButton({ fileType: scope.FILE_TYPE_BPMN, filePath: 'a.bpmn', onButtonClickFunc: () => {} });
        assert.equal(ui.isButtonPresent(), false);
    });
});
