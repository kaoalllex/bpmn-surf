'use strict';

// Service worker механизма обновления (FEAT-0012). Фоновая проверка новой
// версии по расписанию (chrome.alarms), бейдж на иконке, хранение состояния в
// chrome.storage.local и обработка сообщений от popup и страницы диффера.
//
// Расширение НЕ заменяет свои файлы само (ограничение load-unpacked) — SW лишь
// уведомляет; применяет обновление пользователь (git pull + chrome.runtime.reload).
//
// Чистая логика — в version-info.js / update-checker.js (юнит-тесты);
// здесь только chrome.*-glue.

importScripts(
    '/src/core/config.js',
    '/src/update/version-info.js',
    '/src/update/update-checker.js'
);

const ALARM_NAME = 'bpmn-diff-update-check';
const BADGE_COLOR = '#1f75cb';

// --- состояние в storage ---------------------------------------------------

async function readState() {
    const stored = await chrome.storage.local.get(UPDATE_STORAGE_KEY);
    const state = stored[UPDATE_STORAGE_KEY] || {};
    return {
        enabled: state.enabled !== undefined ? state.enabled : UPDATE_CHECK_ENABLED_DEFAULT,
        lastResult: state.lastResult || null
    };
}

async function writeState(patch) {
    const current = await readState();
    const next = { ...current, ...patch };
    await chrome.storage.local.set({ [UPDATE_STORAGE_KEY]: next });
    return next;
}

// --- бейдж -----------------------------------------------------------------

async function setBadge(updateAvailable) {
    try {
        await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
        await chrome.action.setBadgeText({ text: updateAvailable ? '●' : '' });
    } catch (e) {
        // action может быть недоступен в редких состояниях — не критично.
    }
}

// --- проверка --------------------------------------------------------------

async function runCheck() {
    const { enabled } = await readState();
    if (!enabled) {
        await setBadge(false);
        return null;
    }
    const currentVersion = chrome.runtime.getManifest().version;
    const checker = new UpdateChecker();
    const result = await checker.check({
        manifestUrl: UPDATE_VERSION_MANIFEST_URL,
        changelogUrl: UPDATE_CHANGELOG_URL,
        currentVersion
    });
    const lastResult = { ...result, currentVersion, checkedAt: Date.now() };
    await writeState({ lastResult });
    await setBadge(!!result.updateAvailable);
    return lastResult;
}

// --- расписание ------------------------------------------------------------

async function ensureAlarm() {
    const existing = await chrome.alarms.get(ALARM_NAME);
    if (!existing) {
        await chrome.alarms.create(ALARM_NAME, {
            periodInMinutes: UPDATE_CHECK_INTERVAL_MINUTES,
            delayInMinutes: 1
        });
    }
}

chrome.runtime.onInstalled.addListener(async () => {
    await ensureAlarm();
    await runCheck();
});

chrome.runtime.onStartup.addListener(async () => {
    await ensureAlarm();
    await runCheck();
});

chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === ALARM_NAME) {
        runCheck();
    }
});

// --- сообщения от popup / страницы диффера ---------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message).then(sendResponse).catch(err => {
        sendResponse({ ok: false, error: String((err && err.message) || err) });
    });
    return true; // ответ асинхронный
});

async function buildStateReply() {
    const state = await readState();
    return {
        ok: true,
        enabled: state.enabled,
        currentVersion: chrome.runtime.getManifest().version,
        lastResult: state.lastResult,
        // прозрачность: показываем, куда именно ходим
        manifestUrl: UPDATE_VERSION_MANIFEST_URL,
        homeUrl: UPDATE_HOME_URL,
        gitPullCommand: UPDATE_GIT_PULL_COMMAND
    };
}

async function handleMessage(message) {
    switch (message && message.type) {
        case 'update:getState':
            return buildStateReply();

        case 'update:checkNow':
            await runCheck();
            return buildStateReply();

        case 'update:setEnabled': {
            await writeState({ enabled: !!message.enabled });
            if (message.enabled) {
                await runCheck();
            } else {
                await setBadge(false);
            }
            return buildStateReply();
        }

        case 'update:reload':
            // unpacked: перечитывает файлы с диска (трактуется как update).
            chrome.runtime.reload();
            return { ok: true };

        case 'update:openPopup':
            try {
                await chrome.action.openPopup();
                return { ok: true };
            } catch (e) {
                // openPopup доступен не всегда (требует фокус окна) —
                // fallback: открыть popup как вкладку.
                await chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/popup.html') });
                return { ok: true, fallback: 'tab' };
            }

        case 'update:openUrl':
            if (message.url) {
                await chrome.tabs.create({ url: message.url });
            }
            return { ok: true };

        default:
            return { ok: false, error: `unknown message type: ${message && message.type}` };
    }
}
