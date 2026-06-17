---
id: FEAT-0012
title: Автообновление версии плагина
priority: low
status: partial
---

## Постановка

Цели: не заставлять обновлять руками; уведомлять о новых версиях.

Пользователь должен: увидеть уведомление о новой версии и при желании запустить
обновление; видеть «что нового»; мочь выключить автообновление. Ключевое —
полная прозрачность (доверие пользователей) и не сломать текущую функциональность.

## Контекст

Решение (по итогам анализа современных подходов): **встроенный нотификатор**
поверх `load unpacked`. Расширение принципиально не может заменить свои файлы
само (нет API), поэтому это уведомление + проводимое обновление (`git pull` +
`chrome.runtime.reload`), а не тихий автоапдейт. Источник версии — публичный
`version.json` (+ `CHANGELOG.md`), развязан с кодом: анонсируем версию только
когда артефакт реально доступен.

Альтернативы (тихий автоапдейт) задокументированы как будущие апгрейды
дистрибуции, требующие IT/Google, а не кода: self-hosted CRX + корпоративная
политика (`override_update_url`, force-install через MDM) и Chrome Web Store
(unlisted). Связано с переездом исходников на публичный GitHub.

Архитектура: третий scope скриптов (extension-context) — service worker
`src/background/update-service-worker.js` (проверка по `chrome.alarms`, бейдж,
состояние в `chrome.storage.local`) и popup `src/popup/` (UI). Чистая логика —
`src/update/version-info.js` + `src/update/update-checker.js` (юнит-тесты).
Индикатор в тулбаре дифера — общий `src/differ/shared/update-indicator.js`
(differ-страница без `chrome.*`: `updateInfo` приходит в params от content-script'а,
клик открывает popup как web-accessible вкладку). Конфиг — `config.js#UPDATE_*`.
Затронуты: `manifest.json` (action/background/permissions storage+alarms/
host_permissions/WAR), `utils.js#loadScripts`, `app.js#openDiffer`,
`bpmn-differ.js`/`dmn-differ.js`, оба differ-вью, `styles.css`, скилл `release`,
README, `docs/architecture.md`.

Осталось (почему `partial`):
- заполнить `UPDATE_VERSION_MANIFEST_URL`/`UPDATE_CHANGELOG_URL`/`UPDATE_HOME_URL`
  в `config.js` после переезда на публичный GitHub (до этого фича инертна — no-op);
- ручная проверка end-to-end на живом источнике (бейдж · popup · «что нового» ·
  индикатор в дифере · перезагрузка через `runtime.reload`);
- опционально — брендовая иконка action (сейчас бейдж работает на дефолтной).

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись по шаблону ниже.
     Новые записи добавляй сверху (свежие первыми). -->

### 2026-06-17 · claude-opus-4-8 · ветка `feature/feat-0012-auto-update`

Реализован встроенный нотификатор обновлений. Чистая логика версий/changelog
(`version-info.js`, `update-checker.js`) с юнит-тестами; service worker
(проверка по alarms, бейдж, storage); popup (версии, «что нового», `git pull`
copy + перезагрузка, тумблер автопроверки, явный URL источника + «данные не
отправляются»); индикатор «🔔 vX» в тулбаре BPMN/DMN дифера (общий
`UpdateIndicator`, поток через params + `window.open` popup'а). manifest:
`action`/`background`/`storage`+`alarms`/`host_permissions`/WAR `popup.html`.
`release`-скилл бампит `version.json` и пишет `CHANGELOG.md`. `npm test` — зелёный
(764). Content_scripts и differ-конвейер не тронуты. Активация — после задания
`UPDATE_*` URL (переезд на GitHub) + ручная проверка → тогда `done`.
