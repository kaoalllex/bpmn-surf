'use strict';

// A stateful chrome.* for the popup page served by the static server. The state —
// granted origins, chrome.storage.sync/local, and every permission call — lives in
// sessionStorage, so it survives a reload of the popup the way the browser's own
// would; `seed` is applied only on the first load. `granted` answers
// permissions.request.
function installedStub({ seed, granted }) {
    const KEY = '__chromeStub';
    if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, JSON.stringify({
            origins: [], sync: {}, local: {}, requests: [], removals: [], ...seed
        }));
    }
    const load = () => JSON.parse(sessionStorage.getItem(KEY));
    const update = (change) => {
        const state = load();
        change(state);
        sessionStorage.setItem(KEY, JSON.stringify(state));
    };
    const pick = (area, key) => {
        const stored = load()[area];
        if (key === undefined || key === null) {
            return { ...stored };
        }
        return Object.fromEntries([].concat(key).filter(k => k in stored).map(k => [k, stored[k]]));
    };
    const area = (name) => ({
        get: async (key) => pick(name, key),
        set: async (items) => update(state => Object.assign(state[name], items)),
        remove: async (keys) => update(state => [].concat(keys).forEach(k => delete state[name][k]))
    });
    window.chrome = {
        runtime: { getManifest: () => ({ version: '9.9.9' }) },
        permissions: {
            getAll: async () => ({ origins: load().origins }),
            request: async ({ origins }) => {
                update(state => {
                    state.requests.push(origins);
                    if (granted) {
                        state.origins = [...new Set([...state.origins, ...origins])];
                    }
                });
                return granted;
            },
            remove: async ({ origins }) => {
                update(state => {
                    state.removals.push(origins);
                    state.origins = state.origins.filter(o => !origins.includes(o));
                });
                return true;
            }
        },
        storage: { sync: area('sync'), local: area('local') }
    };
}

async function installChromeStub(page, { seed = {}, granted = true } = {}) {
    await page.addInitScript(installedStub, { seed, granted });
}

const stubState = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('__chromeStub')));

module.exports = { installChromeStub, stubState };
