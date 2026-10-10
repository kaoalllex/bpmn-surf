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
// The toolbar icon shows "!" while no site is on, the gitlab.com notice waits or
// a site's type is unknown.

importScripts('/src/hosts/host-patterns.js');

const USER_HOSTS_SCRIPT_ID = 'bpmn-surf-user-hosts';
// Amber: "!" asks for the user's action (a warning), the default grey-blue goes unnoticed.
const BADGE_COLOR = '#F5B400';
const BADGE_TEXT_COLOR = '#1F1F1F';

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
    const { [UNDETECTED_SITES_KEY]: undetected } = await chrome.storage.local.get(UNDETECTED_SITES_KEY);
    const stored = (undetected && undetected.hosts) || [];
    const pending = pruneUndetectedSites(stored, origins);
    if (pending.length !== stored.length) {
        await chrome.storage.local.set({ [UNDETECTED_SITES_KEY]: { hosts: pending } });
    }
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
    // setBadgeTextColor exists since Chrome 110; the manifest sets no minimum version
    if (chrome.action.setBadgeTextColor) {
        await chrome.action.setBadgeTextColor({ color: BADGE_TEXT_COLOR });
    }
    await chrome.action.setBadgeText({ text: matches.length === 0 || notice || pending.length ? '!' : '' });
    return matches;
}

// One run at a time: onInstalled hears its own storage write, and a failed run
// must neither block later ones nor surface as an unhandled rejection.
let reconciling = Promise.resolve();
function reconcile() {
    reconciling = reconciling.then(reconcileHostRegistrations)
        .catch(e => console.error('bpmn-surf: could not reconcile host registrations', e));
    return reconciling;
}

async function onInstalled({ reason, previousVersion }) {
    const { origins } = await chrome.permissions.getAll();
    if (reason === 'update' && needsGitlabComNotice(previousVersion, origins)) {
        await chrome.storage.local.set({ [GITLAB_COM_NOTICE_KEY]: true });
    }
    await reconcile();
}

// onInstalled covers a fresh install and every update, onStartup a browser
// restart (badge persistence is undocumented); the permission events cover the
// user adding a host in the popup and revoking one in chrome://extensions; the
// storage events cover the popup dismissing the notice and a page reporting or
// clearing a site of unknown type.
chrome.runtime.onInstalled.addListener(onInstalled);
chrome.runtime.onStartup.addListener(reconcile);
chrome.permissions.onAdded.addListener(reconcile);
chrome.permissions.onRemoved.addListener(reconcile);
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (GITLAB_COM_NOTICE_KEY in changes || UNDETECTED_SITES_KEY in changes)) {
        reconcile();
    }
});
