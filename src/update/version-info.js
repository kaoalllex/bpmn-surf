'use strict';

// Чистая логика версий и changelog для механизма обновления (FEAT-0012).
// Без DOM/сети/chrome.* — переиспользуется service worker'ом и popup'ом,
// покрыта юнит-тестами (test/update/version-info.test.js).
class VersionInfo {
    // Нормализует строку версии к массиву чисел: 'v0.18.0', '[0.18.0]', '0.18'
    // → [0, 18, 0]. Нечисловые части → 0. Пустая/невалидная → [].
    static parse(version) {
        if (typeof version !== 'string') {
            return [];
        }
        const cleaned = version.trim().replace(/^v/i, '').replace(/^\[|\]$/g, '');
        if (cleaned === '') {
            return [];
        }
        return cleaned.split('.').map(part => {
            const n = parseInt(part, 10);
            return Number.isFinite(n) ? n : 0;
        });
    }

    // Численное сравнение версий (а не лексическое — иначе '0.9' > '0.18').
    // Возвращает -1 / 0 / 1. Недостающие части трактуются как 0 ('1.2' == '1.2.0').
    static compare(a, b) {
        const pa = VersionInfo.parse(a);
        const pb = VersionInfo.parse(b);
        const len = Math.max(pa.length, pb.length);
        for (let i = 0; i < len; i++) {
            const da = pa[i] || 0;
            const db = pb[i] || 0;
            if (da > db) return 1;
            if (da < db) return -1;
        }
        return 0;
    }

    // true, если latest строго новее current.
    static isNewer(current, latest) {
        if (VersionInfo.parse(latest).length === 0) {
            return false;
        }
        return VersionInfo.compare(latest, current) > 0;
    }

    // Разбирает CHANGELOG.md на записи [{version, body}] в порядке файла
    // (свежие сверху). Запись = заголовок '## <версия>' + текст до следующего
    // заголовка уровня '#'/'##'. version нормализуется (без 'v'/скобок).
    static parseChangelog(markdown) {
        if (typeof markdown !== 'string') {
            return [];
        }
        const lines = markdown.split(/\r?\n/);
        const entries = [];
        let current = null;
        for (const line of lines) {
            const match = /^##\s+(.+?)\s*$/.exec(line);
            if (match && !line.startsWith('###')) {
                const version = match[1].trim().replace(/^v/i, '').replace(/^\[|\]$/g, '');
                current = { version, body: [] };
                entries.push(current);
            } else if (line.startsWith('# ')) {
                // Заголовок верхнего уровня (название файла) закрывает текущую секцию.
                current = null;
            } else if (current) {
                current.body.push(line);
            }
        }
        return entries.map(e => ({ version: e.version, body: e.body.join('\n').trim() }));
    }

    // Записи changelog строго новее установленной версии (порядок сохраняется —
    // свежие сверху). Используется для блока «Что нового».
    static changesSince(markdown, currentVersion) {
        return VersionInfo.parseChangelog(markdown)
            .filter(entry => VersionInfo.isNewer(currentVersion, entry.version));
    }
}
