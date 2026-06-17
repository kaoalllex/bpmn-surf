// GitLab default branch (usually this is "master", but can also be "main")
const MASTER_BRANCH_NAME = 'master';
//const MASTER_BRANCH_NAME = 'main';

// --- Обновление расширения (FEAT-0012) ------------------------------------
// Источник версии — публичный version.json (см. формат в корневом version.json
// и docs/architecture.md). Расширение само НЕ заменяет свои файлы (ограничение
// load-unpacked): оно только уведомляет и ведёт пользователя по обновлению.
//
// TODO(github-migration): заполнить после переезда исходников на публичный
// GitHub. Пока URL пустые → проверка обновлений неактивна (никаких сетевых
// запросов, ошибок нет). Origin из *_URL должен быть в manifest#host_permissions.
// Пример (raw GitHub): https://raw.githubusercontent.com/<owner>/bpmn-diff/master/version.json
const UPDATE_VERSION_MANIFEST_URL = '';
// Пример: https://raw.githubusercontent.com/<owner>/bpmn-diff/master/CHANGELOG.md
const UPDATE_CHANGELOG_URL = '';
// Страница загрузки/релизов (открывается по кнопке «Обновить»).
// Пример: https://github.com/<owner>/bpmn-diff
const UPDATE_HOME_URL = '';
// Команда обновления для git-установки (показывается в popup с copy-кнопкой).
const UPDATE_GIT_PULL_COMMAND = 'git pull';

// Как часто проверять обновления (минуты). chrome.alarms.
const UPDATE_CHECK_INTERVAL_MINUTES = 360;
// Автопроверка по умолчанию включена; пользователь выключает тумблером в popup.
const UPDATE_CHECK_ENABLED_DEFAULT = true;
// Ключ настроек/результата в chrome.storage.local.
const UPDATE_STORAGE_KEY = 'updateState';
