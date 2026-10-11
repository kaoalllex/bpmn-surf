'use strict';

// The service worker runs in a vm context of its own over a recording chrome.*:
// importScripts loads the real host-patterns.js, fetch serves the real
// content-scripts.json, and the test drives it through the listeners it registers.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read } = require('../support/source-tree.js');

const CONTENT_SCRIPTS = JSON.parse(read('src/hosts/content-scripts.json'));
const GITLAB_COM = 'https://gitlab.com/*';
const GITHUB_COM = 'https://github.com/*';

function startWorker({ origins = [], local = {}, registered = [] } = {}) {
    const state = { origins, local: { ...local }, registered: [...registered], badge: null, errors: [] };
    const listeners = {};
    const event = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });
    const chrome = {
        runtime: {
            getURL: (path) => `chrome-extension://id/${path}`,
            onInstalled: event('onInstalled'),
            onStartup: event('onStartup')
        },
        permissions: {
            getAll: async () => ({ origins: [...state.origins] }),
            onAdded: event('onAdded'),
            onRemoved: event('onRemoved')
        },
        scripting: {
            getRegisteredContentScripts: async ({ ids }) => state.registered.filter(s => ids.includes(s.id)),
            unregisterContentScripts: async ({ ids }) => {
                state.registered = state.registered.filter(s => !ids.includes(s.id));
            },
            registerContentScripts: async (scripts) => { state.registered.push(...scripts); }
        },
        storage: {
            local: {
                get: async (key) => (key in state.local ? { [key]: state.local[key] } : {}),
                set: async (items) => { Object.assign(state.local, items); },
                remove: async (key) => { delete state.local[key]; }
            },
            onChanged: event('onChanged')
        },
        action: {
            setBadgeBackgroundColor: async () => {},
            setBadgeTextColor: async () => {},
            setBadgeText: async ({ text }) => { state.badge = text; }
        }
    };
    const context = vm.createContext({
        chrome,
        console: { ...console, error: (...args) => state.errors.push(args.join(' ')) },
        fetch: async (url) => {
            assert.equal(url, 'chrome-extension://id/src/hosts/content-scripts.json');
            return { json: async () => CONTENT_SCRIPTS };
        },
        importScripts: (path) => vm.runInContext(read(path.replace(/^\//, '')), context)
    });
    vm.runInContext(read('src/background/service-worker.js'), context);
    return { state, listeners };
}

// Plain copies: objects built inside the vm realm fail deepEqual on prototype.
const plain = (value) => JSON.parse(JSON.stringify(value));

describe('service worker — content-script registration', () => {
    it('registers the declared js/css for every granted site, in one registration', async () => {
        const { state, listeners } = startWorker({ origins: [GITLAB_COM, GITHUB_COM, 'chrome://favicon/*'] });

        await listeners.onStartup();

        assert.deepEqual(plain(state.registered), [{
            id: 'bpmn-surf-user-hosts',
            matches: [GITHUB_COM, GITLAB_COM],
            js: CONTENT_SCRIPTS.js,
            css: CONTENT_SCRIPTS.css,
            runAt: 'document_idle'
        }]);
        assert.equal(state.badge, '');
        assert.deepEqual(state.errors, []);
    });

    it('replaces the previous registration when a site is revoked', async () => {
        const { state, listeners } = startWorker({ origins: [GITLAB_COM, GITHUB_COM] });
        await listeners.onStartup();

        state.origins = [GITHUB_COM];
        await listeners.onRemoved();

        assert.equal(state.registered.length, 1);
        assert.deepEqual(plain(state.registered[0].matches), [GITHUB_COM]);
    });

    it('registers nothing and shows "!" when no site is granted', async () => {
        const { state, listeners } = startWorker({ registered: [{ id: 'bpmn-surf-user-hosts', matches: [GITLAB_COM] }] });

        await listeners.onStartup();

        assert.deepEqual(state.registered, []);
        assert.equal(state.badge, '!');
    });
});

describe('service worker — the "!" badge', () => {
    it('shows "!" while a granted site waits for its type, and drops a revoked one from the list', async () => {
        const { state, listeners } = startWorker({
            origins: [GITLAB_COM, 'https://git.acme.com/*'],
            local: { undetectedSites: { hosts: ['git.acme.com', 'gone.acme.com'] } }
        });

        await listeners.onStartup();

        assert.equal(state.badge, '!');
        assert.deepEqual(plain(state.local.undetectedSites), { hosts: ['git.acme.com'] });
    });

    it('sets the gitlab.com notice on an update from 1.3 that lost gitlab.com', async () => {
        const { state, listeners } = startWorker({ origins: [GITHUB_COM] });

        await listeners.onInstalled({ reason: 'update', previousVersion: '1.3.2' });

        assert.equal(state.local.gitlabComNotice, true);
        assert.equal(state.badge, '!');
    });

    it('sets no notice on a fresh install, and clears it once gitlab.com is granted', async () => {
        const fresh = startWorker({ origins: [GITHUB_COM] });
        await fresh.listeners.onInstalled({ reason: 'install' });
        assert.equal('gitlabComNotice' in fresh.state.local, false);
        assert.equal(fresh.state.badge, '');

        const { state, listeners } = startWorker({ origins: [GITLAB_COM], local: { gitlabComNotice: true } });
        await listeners.onAdded();
        assert.equal('gitlabComNotice' in state.local, false);
        assert.equal(state.badge, '');
    });

    it('reconciles when the popup dismisses the notice, not on other storage changes', async () => {
        const { state, listeners } = startWorker({ origins: [GITHUB_COM], local: { gitlabComNotice: true } });
        await listeners.onStartup();
        assert.equal(state.badge, '!');

        delete state.local.gitlabComNotice;
        listeners.onChanged({ settings: {} }, 'sync');
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(state.badge, '!', 'a sync change does not reconcile');

        listeners.onChanged({ gitlabComNotice: { oldValue: true } }, 'local');
        for (let i = 0; i < 20 && state.badge === '!'; i++) {
            await new Promise(resolve => setImmediate(resolve));
        }
        assert.equal(state.badge, '');
    });
});
