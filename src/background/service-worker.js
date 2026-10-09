'use strict';

// Keeps the runtime content-script registrations in sync with the host
// permissions the user granted from the popup (FEAT-0033). No site is built
// in: every granted origin — gitlab.com, github.com, a self-managed GitLab — is
// registered here, with the js/css list from src/hosts/content-scripts.json
// (its order is the load order, docs/conventions.md).
//
// The granted origins ARE the stored list: nothing is kept in chrome.storage,
// and the user may revoke a host in chrome://extensions at any time — hence a
// reconcile on permission events rather than a write when the host is added.
// The toolbar icon shows "!" while no site is on or the gitlab.com notice waits.

importScripts('/src/hosts/host-patterns.js');

const USER_HOSTS_SCRIPT_ID = 'bpmn-surf-user-hosts';

async function reconcileHostRegistrations() {
    const declared = await (await fetch(chrome.runtime.getURL('src/hosts/content-scripts.json'))).json();
    const { origins } = await chrome.permissions.getAll();
    const matches = userOriginsFrom(origins);
    try {
        const existing = await chrome.scripting.getRegisteredContentScripts({
            ids: [USER_HOSTS_SCRIPT_ID]
        });
        if (existing.length) {
            await chrome.scripting.unregisterContentScripts({ ids: [USER_HOSTS_SCRIPT_ID] });
        }
        if (matches.length) {
            await chrome.scripting.registerContentScripts([{
                id: USER_HOSTS_SCRIPT_ID,
                matches: matches,
                js: declared.js,
                css: declared.css,
                runAt: 'document_idle'
            }]);
        }
    } catch (e) {
        console.error('bpmn-surf: could not update the content script registration', e);
    }
    if (origins.includes(GITLAB_COM)) {
        await chrome.storage.local.remove(GITLAB_COM_NOTICE_KEY);
    }
    const { [GITLAB_COM_NOTICE_KEY]: notice } = await chrome.storage.local.get(GITLAB_COM_NOTICE_KEY);
    await chrome.action.setBadgeText({ text: matches.length === 0 || notice ? '!' : '' });
    return matches;
}

async function onInstalled({ reason, previousVersion }) {
    const { origins } = await chrome.permissions.getAll();
    if (reason === 'update' && needsGitlabComNotice(previousVersion, origins)) {
        await chrome.storage.local.set({ [GITLAB_COM_NOTICE_KEY]: true });
    }
    await reconcileHostRegistrations();
}

// onInstalled covers a fresh install and every update; the permission events
// cover the user adding a host in the popup and revoking one in
// chrome://extensions; the storage event covers the popup dismissing the notice.
chrome.runtime.onInstalled.addListener(onInstalled);
chrome.permissions.onAdded.addListener(reconcileHostRegistrations);
chrome.permissions.onRemoved.addListener(reconcileHostRegistrations);
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && GITLAB_COM_NOTICE_KEY in changes) {
        reconcileHostRegistrations();
    }
});
