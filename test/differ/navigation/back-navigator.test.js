'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const DIVED_IN_FROM = { filePath: 'bpmn/Caller.bpmn', fileName: 'Caller.bpmn' };
const OTHER = { filePath: 'bpmn/Other.bpmn', fileName: 'Other.bpmn' };

function locatorReturning(result) {
    return {
        resolveCallers: async () => result,
        blobSearchPageUrl: () => 'https://gitlab.example/search'
    };
}

function failingLocator() {
    return {
        resolveCallers: async () => { throw new Error('search failed'); },
        blobSearchPageUrl: () => 'https://gitlab.example/search'
    };
}

describe('BackNavigator', () => {
    let scope;
    let calls;

    beforeEach(() => {
        scope = createScope();
        calls = { diveOutToOpener: 0, opened: [], urls: [] };
    });

    function build({ divedInFrom = null, callerLocator = locatorReturning([]),
                     getProcessIdsFunc = () => ['P1'] } = {}) {
        const nav = new scope.BackNavigator({
            callerLocator,
            divedInFrom,
            getProcessIdsFunc,
            getCurrentRefFunc: () => 'main',
            currentFilePath: 'bpmn/Self.bpmn',
            onDiveOutToOpener: () => { calls.diveOutToOpener++; },
            onOpenCaller: (filePath, fileName) => calls.opened.push([filePath, fileName]),
            onOpenUrl: (url) => calls.urls.push(url)
        });
        return { nav, group: nav.createElement() };
    }

    describe('createElement', () => {
        it('returns null when nothing we dived in from and no locator', () => {
            const { group } = build({ divedInFrom: null, callerLocator: null });
            assert.equal(group, null);
        });

        it('renders only the dive-out button when there is no locator (e.g. DMN)', () => {
            const { group } = build({ divedInFrom: DIVED_IN_FROM, callerLocator: null });
            assert.ok(group.querySelector('button'));
            assert.equal(group.querySelector('.differ-back-caret'), null);
        });

        it('renders the dive-out button and the caret when a locator is present', () => {
            const { group } = build({ divedInFrom: DIVED_IN_FROM });
            assert.ok(group.querySelector('.differ-back-caret'));
        });
    });

    describe('dive-out button', () => {
        it('names the diagram we dived in from in its title', () => {
            const { group } = build({ divedInFrom: DIVED_IN_FROM });
            assert.match(group.querySelector('button').title, /Caller\.bpmn/);
        });

        it('jumps to the open caller tab when we dived in', () => {
            const { group } = build({ divedInFrom: DIVED_IN_FROM });
            group.querySelector('button').click();
            assert.equal(calls.diveOutToOpener, 1);
        });

        it('opens the callers menu when we did not dive in (caller unknown)', async () => {
            const { group } = build({ divedInFrom: null, callerLocator: locatorReturning([OTHER]) });
            group.querySelector('button').click(); // the dive-out button, no caret needed
            await flush();
            assert.equal(group.querySelector('.differ-back-menu').hidden, false);
            assert.equal(calls.diveOutToOpener, 0);
        });
    });

    describe('callers menu', () => {
        function openMenu(group) {
            group.querySelector('.differ-back-caret').click();
            return flush();
        }

        it('lists the callers found by the locator', async () => {
            const { group } = build({ divedInFrom: DIVED_IN_FROM, callerLocator: locatorReturning([OTHER, DIVED_IN_FROM]) });
            await openMenu(group);
            assert.equal(group.querySelectorAll('.differ-back-menu-item').length, 2);
        });

        it('puts the diagram we dived in from first and marks it', async () => {
            const { group } = build({ divedInFrom: DIVED_IN_FROM, callerLocator: locatorReturning([OTHER, DIVED_IN_FROM]) });
            await openMenu(group);
            const items = group.querySelectorAll('.differ-back-menu-item');
            assert.match(items[0].textContent, /Caller\.bpmn/);
            assert.ok(items[0].classList.contains('differ-back-menu-item-came-from'));
            assert.ok(!items[1].classList.contains('differ-back-menu-item-came-from'));
        });

        it('opens a fresh caller (up) and closes the menu on click', async () => {
            const { group } = build({ divedInFrom: DIVED_IN_FROM, callerLocator: locatorReturning([OTHER]) });
            await openMenu(group);
            group.querySelector('.differ-back-menu-item').click();
            assert.deepEqual(calls.opened, [['bpmn/Other.bpmn', 'Other.bpmn']]);
            assert.equal(group.querySelector('.differ-back-menu').hidden, true);
        });

        it('reuses the open tab when clicking the diagram we dived in from', async () => {
            const { group } = build({ divedInFrom: DIVED_IN_FROM, callerLocator: locatorReturning([DIVED_IN_FROM]) });
            await openMenu(group);
            group.querySelector('.differ-back-menu-item').click();
            assert.equal(calls.diveOutToOpener, 1);
            assert.equal(calls.opened.length, 0); // not reopened fresh
        });

        // The diagram may not be parsed yet when the caret is clicked, so the getter
        // can answer with nothing — the locator must still receive a list.
        it('passes an empty list when there are no process ids yet', async () => {
            const seen = [];
            const callerLocator = {
                resolveCallers: async (processIds) => { seen.push(processIds); return []; },
                blobSearchPageUrl: () => 'https://gitlab.example/search'
            };
            const { group } = build({ divedInFrom: DIVED_IN_FROM, callerLocator, getProcessIdsFunc: () => null });
            await openMenu(group);
            assert.deepEqual(Array.from(seen[0]), []);
        });

        it('shows a "no caller" message for a top-level diagram (empty result)', async () => {
            const { group } = build({ divedInFrom: null, callerLocator: locatorReturning([]) });
            await openMenu(group);
            assert.match(group.querySelector('.differ-back-menu-message').textContent, /No diagram calls this one/);
            assert.equal(group.querySelectorAll('.differ-back-menu-item').length, 0);
        });

        it('shows an error with a GitLab-search link when the lookup fails', async () => {
            const { group } = build({ divedInFrom: null, callerLocator: failingLocator() });
            await openMenu(group);
            assert.match(group.querySelector('.differ-back-menu-message').textContent, /Couldn't check/);
            const link = group.querySelector('.differ-back-menu-link');
            assert.ok(link);
            link.click();
            assert.deepEqual(calls.urls, ['https://gitlab.example/search']);
        });

        it('toggles the menu open and closed on repeated caret clicks', async () => {
            const { group } = build({ divedInFrom: DIVED_IN_FROM, callerLocator: locatorReturning([OTHER]) });
            const caret = group.querySelector('.differ-back-caret');
            const menu = group.querySelector('.differ-back-menu');

            caret.click();
            await flush();
            assert.equal(menu.hidden, false);

            caret.click();
            assert.equal(menu.hidden, true);
        });
    });
});
