'use strict';

// Сетевая часть проверки обновлений (FEAT-0012): тянет version.json и (если
// есть новее) CHANGELOG.md, считает результат через VersionInfo. Без chrome.* и
// без записи состояния — это делает service worker. Фетчеры инъектируются
// (DI) → класс юнит-тестируется без настоящей сети (test/update/update-checker.test.js).
//
// Принципиально: данные только читаются (GET), ничего не отправляем,
// credentials:'omit' — никаких cookies (прозрачность/доверие).
class UpdateChecker {
    constructor({ fetchJson, fetchText } = {}) {
        this._fetchJson = fetchJson || UpdateChecker.defaultFetchJson;
        this._fetchText = fetchText || UpdateChecker.defaultFetchText;
    }

    static defaultFetchJson(url) {
        return fetch(url, { credentials: 'omit', cache: 'no-store' })
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            });
    }

    static defaultFetchText(url) {
        return fetch(url, { credentials: 'omit', cache: 'no-store' })
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.text();
            });
    }

    // Возвращает результат проверки:
    //   { configured, latestVersion, downloadUrl, updateAvailable, changes, error }
    // configured:false — источник версии не настроен (пустой URL) → no-op.
    // error — строка при сетевой/парс-ошибке (updateAvailable=false).
    async check({ manifestUrl, changelogUrl, currentVersion }) {
        if (!manifestUrl) {
            return { configured: false, updateAvailable: false, changes: [] };
        }
        try {
            const manifest = await this._fetchJson(manifestUrl);
            const latestVersion = (manifest && manifest.version) || '';
            const updateAvailable = VersionInfo.isNewer(currentVersion, latestVersion);

            let changes = [];
            const notesUrl = changelogUrl || (manifest && manifest.changelogUrl) || '';
            if (updateAvailable && notesUrl) {
                try {
                    const markdown = await this._fetchText(notesUrl);
                    changes = VersionInfo.changesSince(markdown, currentVersion);
                } catch (e) {
                    // Заметки — необязательны: обновление показываем и без них.
                    changes = [];
                }
            }

            return {
                configured: true,
                latestVersion,
                downloadUrl: (manifest && manifest.downloadUrl) || '',
                updateAvailable,
                changes
            };
        } catch (e) {
            return {
                configured: true,
                updateAvailable: false,
                changes: [],
                error: String((e && e.message) || e)
            };
        }
    }
}
