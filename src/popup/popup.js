'use strict';

// UI окна обновления (FEAT-0012). Сетью и состоянием владеет service worker;
// popup только отображает состояние и шлёт ему команды. Один и тот же файл
// работает как action-popup и как открытая вкладка.

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
        return `Проверено: ${new Date(ts).toLocaleString('ru-RU')}`;
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

    // транспарентность: что и куда проверяем
    if (state.manifestUrl) {
        els.transparency.textContent =
            `Проверка версии: ${state.manifestUrl} — только чтение (GET), без cookies, ничего не отправляется.`;
    } else {
        els.transparency.textContent =
            'Источник обновлений не настроен — автоматическая проверка отключена.';
    }

    const available = !!result.updateAvailable;
    els.statusBlock.classList.toggle('up-to-date', !available && state.manifestUrl && !result.error);

    if (!state.enabled) {
        els.statusLine.textContent = 'Автопроверка выключена.';
    } else if (!state.manifestUrl) {
        els.statusLine.textContent = 'Источник обновлений не настроен.';
    } else if (result.error) {
        els.statusLine.textContent = 'Не удалось проверить обновления.';
    } else if (available) {
        els.statusLine.textContent = 'Доступно обновление.';
    } else if (result.checkedAt) {
        els.statusLine.textContent = 'Установлена последняя версия.';
    } else {
        els.statusLine.textContent = 'Обновления ещё не проверялись.';
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
    els.statusLine.textContent = 'Проверяю обновления…';
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
        els.copyCmd.textContent = 'скопировано';
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
