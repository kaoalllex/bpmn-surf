'use strict';

// Update window UI (FEAT-0012). The service worker owns the network and state;
// the popup only displays state and sends it commands. The same file works
// both as an action popup and as an open tab.

const els = {
    currentVersion: document.getElementById('currentVersion'),
    statusBlock: document.getElementById('statusBlock'),
    statusLine: document.getElementById('statusLine'),
    checkedAt: document.getElementById('checkedAt'),
    updateBlock: document.getElementById('updateBlock'),
    latestVersion: document.getElementById('latestVersion'),
    changes: document.getElementById('changes'),
    guide: document.getElementById('guide'),
    gitPull: document.getElementById('gitPull'),
    copyCmd: document.getElementById('copyCmd'),
    downloadHint: document.getElementById('downloadHint'),
    downloadLink: document.getElementById('downloadLink'),
    reloadBtn: document.getElementById('reloadBtn'),
    checkNowBtn: document.getElementById('checkNowBtn'),
    autoCheck: document.getElementById('autoCheck'),
    transparency: document.getElementById('transparency')
};

function send(message) {
    return chrome.runtime.sendMessage(message);
}

function formatCheckedAt(ts) {
    if (!ts) return '';
    try {
        return `Checked: ${new Date(ts).toLocaleString('en-US')}`;
    } catch (e) {
        return '';
    }
}

function renderChanges(changes) {
    els.changes.textContent = '';
    for (const entry of (changes || [])) {
        const head = document.createElement('div');
        head.className = 'pu-change-version';
        head.textContent = entry.version;
        const body = document.createElement('div');
        body.className = 'pu-change-body';
        body.textContent = entry.body || '';
        els.changes.appendChild(head);
        els.changes.appendChild(body);
    }
}

function render(state) {
    const result = state.lastResult || {};

    els.currentVersion.textContent = `v${state.currentVersion || '—'}`;
    els.autoCheck.checked = !!state.enabled;
    els.checkedAt.textContent = formatCheckedAt(result.checkedAt);

    // transparency: what we check and where
    if (state.manifestUrl) {
        els.transparency.textContent =
            `Version check: ${state.manifestUrl} — read only (GET), no cookies, nothing is sent.`;
    } else {
        els.transparency.textContent =
            'Update source is not configured — automatic checking is disabled.';
    }

    const available = !!result.updateAvailable;
    els.statusBlock.classList.toggle('up-to-date', !available && state.manifestUrl && !result.error);

    if (!state.enabled) {
        els.statusLine.textContent = 'Automatic checking is off.';
    } else if (!state.manifestUrl) {
        els.statusLine.textContent = 'Update source is not configured.';
    } else if (result.error) {
        els.statusLine.textContent = 'Could not check for updates.';
    } else if (available) {
        els.statusLine.textContent = 'An update is available.';
    } else if (result.checkedAt) {
        els.statusLine.textContent = 'You are on the latest version.';
    } else {
        els.statusLine.textContent = 'Updates have not been checked yet.';
    }

    if (available) {
        els.latestVersion.textContent = `v${result.latestVersion}`;
        renderChanges(result.changes);
        els.gitPull.textContent = state.gitPullCommand || 'git pull';
        if (state.homeUrl) {
            els.downloadHint.classList.remove('hidden');
            els.downloadLink.dataset.url = state.homeUrl;
        } else {
            els.downloadHint.classList.add('hidden');
        }
        els.updateBlock.classList.remove('hidden');
    } else {
        els.updateBlock.classList.add('hidden');
    }
}

async function refresh() {
    const state = await send({ type: 'update:getState' });
    if (state && state.ok) render(state);
}

async function checkNow() {
    els.checkNowBtn.disabled = true;
    els.statusLine.textContent = 'Checking for updates…';
    try {
        const state = await send({ type: 'update:checkNow' });
        if (state && state.ok) render(state);
    } finally {
        els.checkNowBtn.disabled = false;
    }
}

async function setEnabled(enabled) {
    const state = await send({ type: 'update:setEnabled', enabled });
    if (state && state.ok) render(state);
}

function copyCommand() {
    const text = els.gitPull.textContent;
    navigator.clipboard.writeText(text).then(() => {
        const prev = els.copyCmd.textContent;
        els.copyCmd.textContent = 'copied';
        setTimeout(() => { els.copyCmd.textContent = prev; }, 1500);
    }).catch(() => {});
}

els.checkNowBtn.addEventListener('click', checkNow);
els.autoCheck.addEventListener('change', () => setEnabled(els.autoCheck.checked));
els.copyCmd.addEventListener('click', copyCommand);
els.reloadBtn.addEventListener('click', () => send({ type: 'update:reload' }));
els.downloadLink.addEventListener('click', e => {
    e.preventDefault();
    const url = els.downloadLink.dataset.url;
    if (url) send({ type: 'update:openUrl', url });
});

refresh();
