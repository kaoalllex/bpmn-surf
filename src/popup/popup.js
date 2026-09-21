'use strict';

// Extension popup UI: the installed version, the sites the extension runs on
// (FEAT-0033) and the feedback link. Works both as an action popup and as a tab.
//
// There is no host list to store: the granted optional host permissions are the
// list (docs/conventions.md, "Persistent settings"). The service worker watches
// the same permissions and keeps the content-script registrations in sync.

const DECLARED_MATCHES = chrome.runtime.getManifest().content_scripts[0].matches;

const els = {
    currentVersion: document.getElementById('currentVersion'),
    siteList: document.getElementById('siteList'),
    addHostForm: document.getElementById('addHostForm'),
    hostInput: document.getElementById('hostInput'),
    hostError: document.getElementById('hostError'),
    feedbackLink: document.getElementById('feedbackLink')
};

function hostOf(pattern) {
    return pattern.replace(/^https:\/\//, '').replace(/\/\*$/, '');
}

function showError(message) {
    els.hostError.textContent = message;
    els.hostError.classList.toggle('hidden', !message);
}

// A declared match is injected by Chrome itself and cannot be unregistered
// through the API — it is shown as built-in rather than with a remove button.
function appendSite(pattern, builtIn) {
    const host = hostOf(pattern);
    const item = document.createElement('li');
    item.className = 'pu-site';

    const name = document.createElement('span');
    name.className = 'pu-site-host';
    name.textContent = host;
    item.appendChild(name);

    if (builtIn) {
        const badge = document.createElement('span');
        badge.className = 'pu-site-badge';
        badge.textContent = 'built-in';
        item.appendChild(badge);
    } else {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'pu-site-remove';
        remove.title = `Remove ${host}`;
        remove.textContent = '×';
        remove.addEventListener('click', () => removeHost(pattern));
        item.appendChild(remove);
    }

    els.siteList.appendChild(item);
}

async function renderSites() {
    const { origins } = await chrome.permissions.getAll();
    els.siteList.textContent = '';
    for (const pattern of DECLARED_MATCHES) {
        appendSite(pattern, true);
    }
    for (const pattern of userOriginsFrom(origins, DECLARED_MATCHES)) {
        appendSite(pattern, false);
    }
}

async function removeHost(pattern) {
    await chrome.permissions.remove({ origins: [pattern] });
    await renderSites();
}

els.addHostForm.addEventListener('submit', event => {
    event.preventDefault();
    const pattern = normalizeHostPattern(els.hostInput.value);
    if (!pattern) {
        showError('Enter an https host, for example gitlab.mycompany.com');
        return;
    }
    showError('');
    // Chrome grants the permission only while the user gesture is live, so the
    // request must be issued in this same task — nothing is awaited before it.
    chrome.permissions.request({ origins: [pattern] })
        .then(granted => {
            if (granted) {
                els.hostInput.value = '';
            }
            return renderSites();
        })
        .catch(e => showError(String((e && e.message) || e)));
});

els.currentVersion.textContent = `v${chrome.runtime.getManifest().version}`;
els.feedbackLink.href = FEEDBACK_URL;
renderSites();
