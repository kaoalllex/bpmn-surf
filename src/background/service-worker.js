'use strict';

// Keeps the runtime content-script registrations in sync with the host
// permissions the user granted from the popup (FEAT-0033).
//
// gitlab.com stays declarative in manifest#content_scripts — Chrome injects it
// itself. Every other granted origin is registered here, with the js/css lists
// read from that same manifest entry, so the load order stays defined in one
// place (docs/conventions.md).
//
// The granted origins ARE the stored list: nothing is kept in chrome.storage,
// and the user may revoke a host in chrome://extensions at any time — hence a
// reconcile on permission events rather than a write when the host is added.

importScripts('/src/hosts/host-patterns.js');

const USER_HOSTS_SCRIPT_ID = 'bpmn-surf-user-hosts';

async function reconcileHostRegistrations() {
    const declared = chrome.runtime.getManifest().content_scripts[0];
    const { origins } = await chrome.permissions.getAll();
    const matches = userOriginsFrom(origins, declared.matches);
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
    return matches;
}

// onInstalled covers a fresh install and every update (the script list may
// change between versions); the permission events cover the user adding a host
// in the popup and revoking one in chrome://extensions.
chrome.runtime.onInstalled.addListener(reconcileHostRegistrations);
chrome.permissions.onAdded.addListener(reconcileHostRegistrations);
chrome.permissions.onRemoved.addListener(reconcileHostRegistrations);
