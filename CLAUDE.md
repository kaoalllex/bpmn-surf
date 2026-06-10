# CLAUDE.md — BPMN Diff for GitLab

Chrome Extension (Manifest V3) для визуального сравнения BPMN 2.0 и DMN диаграмм в GitLab merge requests и репозиториях.

## Язык ответов

Всегда отвечай на **русском**, независимо от языка запроса (если пользователь явно не попросил другой язык). Код, команды, пути, логи, идентификаторы и цитаты не переводить.

## Что делает проект

- Детектирует BPMN/DMN файлы на страницах GitLab (MR и просмотр файла в репозитории)
- Загружает две версии диаграммы (ветка MR vs. target branch) через GitLab API
- Рендерит их с подсветкой семантических отличий (🟢 добавлено, 🔴 удалено)
- Поддерживает сравнение с локальным файлом, zoom/pan, "Fit view", панель свойств, скачивание версии

## Архитектура

```
main.js → App (app.js) → Providers → Differs
                          |            ├─ bpmn-differ.js / dmn-differ.js (рендер diff в отдельной странице)
                          ├─ GitLabRepoProvider (данные через GitLab API)
                          └─ GitLabUIRepoProvider (инъекция кнопок в UI GitLab)
```

Поток: `app.js` слушает `mouseup`/`popstate`, детектирует страницу → `gitlab-repo-provider.js` резолвит коммиты/ветки и грузит контент → `gitlab-ui-repo-provider.js` добавляет кнопки "Show schema/decision diff" → по клику через `utils.js#openDiffer` открывается страница diff'а, куда подгружаются библиотеки из `libs/` и скрипты differ'а.

**Два scope'а скриптов** (не путать):
1. **Content scripts GitLab-страницы** — порядок задан в `manifest.json#content_scripts` (app, провайдеры, утилиты).
2. **Страница differ'а** (отдельная вкладка) — скрипты грузятся через `utils.js#loadScripts` в порядке: `utils.js` → файлы-классы → `bpmn-differ.js` → `dmn-differ.js`. Все они делят один глобальный scope этой вкладки. Новый JS-файл для differ-страницы нужно добавить и в `loadScripts`, и в `web_accessible_resources` манифеста.

**Общие классы differ-страницы**: `bpmn-differ.js` (`BpmnDiffer`) и `dmn-differ.js` (`DmnDiffer`) — оркестраторы, оба используют общие классы `DifferParams` (differ-params.js), `DiagramVersions` (diagram-versions.js), `BranchIndicator` (branch-indicator.js), а также `DiffType` (diff-type.js). Глобального изменяемого состояния на differ-странице нет — всё состояние в полях классов, зависимости передаются через конструкторы. Меняя общие классы, проверяй и BPMN-, и DMN-diff.

## Ключевые файлы

| Файл | Назначение |
|------|-----------|
| `main.js` | Точка входа, инициализирует App |
| `app.js` | Главный класс приложения, оркестрация |
| `bpmn-differ.js` | `BpmnDiffer` — оркестратор BPMN-diff'а + bootstrap (message listener) |
| `bpmn-differ-view.js` | `BpmnDifferView` — DOM страницы BPMN-differ'а (layout, header, footer, кнопки) |
| `differ-params.js` | `DifferParams` — параметры differ-страницы из postMessage (общий для BPMN и DMN) |
| `diagram-versions.js` | `DiagramVersions` — загрузка/хранение/скачивание версий диаграммы (общий) |
| `branch-indicator.js` | `BranchIndicator` — имя показываемой ветки в header'е, цвета (общий) |
| `diff-type.js` | `DiffType` — типы diff'а с цветами (общий для BPMN и DMN) |
| `bpmn-xml-comparator.js` | `BpmnXmlComparator` — семантическое сравнение двух BPMN XML |
| `diff-highlighter.js` | `DiffHighlighter` — покраска diff-элементов и highlight-маркеры |
| `changes-table-view.js` | `ChangesTableView` — таблица изменений в футере |
| `properties-panel-highlighter.js` | `PropertiesPanelHighlighter` — подсветка групп в панели свойств, условия |
| `condition-formatter.js` | `ConditionFormatter` — форматирование condition-выражений |
| `canvas-viewport.js` | `CanvasViewport` — pan/zoom/fit канвы |
| `process-file-index.js` | `ProcessFileIndex` — индекс processId→файл, кэш в localStorage |
| `call-activity-navigator.js` | `CallActivityNavigator` — overlay "Dive in" у Call Activity |
| `dmn-differ.js` | `DmnDiffer` — оркестратор DMN-diff'а + bootstrap (message listener) |
| `dmn-differ-view.js` | `DmnDifferView` — DOM страницы DMN-differ'а (layout, header, кнопки) |
| `dmn-table-viewport.js` | `DmnTableViewport` — zoom/fit/scroll таблицы решений dmn-js |
| `dmn-xml-comparator.js` | `DmnXmlComparator` — семантическое сравнение двух DMN XML → diff-модель |
| `dmn-diff-painter.js` | `DmnDiffPainter` — покраска diff-модели на DOM таблицы решений |
| `gitlab-repo-provider.js` | GitLab API, резолв коммитов/веток |
| `gitlab-ui-repo-provider.js` | Инъекция кнопок, выбор файлов |
| `repo-provider.js` / `ui-repo-provider.js` | Базовые интерфейсы провайдеров |
| `models.js` | DTO: `FileType`, `ProjectInfo`, `MergeRequestInfo` |
| `utils.js` | DOM, HTTP, парсинг XML, загрузка скриптов |
| `config.js` | Константы (например, `MASTER_BRANCH_NAME`) |
| `file-type-detector.js` | Определение типа файла по расширению |
| `camunda-bpmn-moddle-manager.js` | Загрузка/кэш Camunda moddle |
| `master-commit-manager.js` | История коммитов master с кэшем в localStorage |
| `page-reloader.js` | Защита от перезагрузок (макс. 3 попытки) |
| `manifest.json` | Манифест MV3; порядок content_scripts критичен |
| `test/` | Юнит-тесты (`node:test` + jsdom): vm-харнесс `test/support/scope.js`, фикстуры `test/fixtures/` — см. раздел «Тестирование» |

## Жёсткие ограничения

- ⚠️ `libs/` (bpmn-js, dmn-js, bpmn-js-properties-panel, camunda-bpmn-moddle) — внешние библиотеки, **НЕ изменять**
- ⚠️ Порядок `content_scripts` в `manifest.json` — **НЕ менять** (зависимости между скриптами)
- ⚠️ `manifest.json` и порядок в `utils.js#loadScripts` — менять только по согласованию с пользователем; типовой согласуемый случай — добавление нового файла differ-страницы (`web_accessible_resources` + `loadScripts`)
- ⚠️ Общие классы differ-страницы (`DifferParams`, `DiagramVersions`, `BranchIndicator`, `DiffType`) использует и BPMN-, и DMN-differ — перед переименованием/изменением Grep по всем js-файлам
- ⚠️ Только vanilla JavaScript (ES6+): без TypeScript, фреймворков, бандлеров и build-шага
- ⚠️ Не добавлять новые runtime-зависимости; dev-зависимости для тестов (`package.json#devDependencies`) — только по согласованию с пользователем (сейчас разрешён только `jsdom`)
- ⚠️ Chrome Manifest V3
- ⚠️ Сохранять существующее поведение, UX и обратную совместимость
- ⚠️ Если пользователь просит **придумать/предложить что-то самому** (имена, коды, схему, структуру, формат) — сперва покажи предложение и дождись подтверждения, и только потом делай зависящую от него работу (чтобы не делать её зря)
- ⚠️ В content scripts GitLab-страницы глобальные переменные хранят критичное состояние — не рефакторить без тщательного анализа; на differ-странице глобального изменяемого состояния быть не должно
- ⚠️ Маленькие, инкрементальные, ревьюибельные изменения; не смешивать рефакторинг с фичами/фиксами
- ⚠️ После изменений, затрагивающих архитектуру, ключевые файлы, потоки или процессы, — **актуализировать инструкции**: CLAUDE.md (разделы «Архитектура», таблица ключевых файлов, ограничения) и промпты/скилы в `.claude/agents/` и `.claude/skills/`. Проверка: Grep по `.claude/` и CLAUDE.md на упоминания изменённых имён/концепций

Если изменение может затронуть поведение: остановись, объясни риск, запроси подтверждение.

## Стиль кода

- ES6+, чистый читаемый код; маленькие чистые функции; читаемость > хитрости; без скрытых side effects
- **PascalCase** классы, **camelCase** переменные/функции, **SCREAMING_SNAKE_CASE** константы
- Приватные члены классов через `#` (не `_`)
- Одинарные кавычки, точки с запятой, отступ 4 пробела (без табов)
- `async/await` вместо `.then`/`.catch`
- Комментарии — только по необходимости, на английском, кратко
- `chrome.*` API; учитывать различия content scripts / service workers

## Тестирование

### Юнит-тесты

Есть юнит-тесты на изолированные классы differ-страницы. Запуск: **`npm test`** (~0.5 сек, прогонять после любых изменений в покрытых файлах). Раннер — встроенный `node:test`; единственная dev-зависимость — `jsdom` (DOM/DOMParser для Node) — в расширение **не попадает**, `manifest.json` не затрагивается.

Отдельного файла-отчёта нет: `node:test` печатает упавшие проверки (assertion diff + стек) прямо в вывод прогона. Не перезапускай тесты, чтобы «посмотреть ошибку» — детали уже есть в выводе предыдущего запуска, читай их оттуда. Повторный прогон оправдан только после изменений в коде/тестах.

Устройство (`test/`):
- `test/support/scope.js` — vm-харнесс: исполняет прод-файлы в одном jsdom vm-контексте в порядке `loadScripts` (имитация общего глобального scope differ-страницы), **не изменяя прод-код**. Чтобы протестировать новый класс: добавь его файл в `SCOPE_FILES` и имя в `EXPORTED_NAMES`. Файлы с side effects при загрузке (`bpmn-differ.js`, `dmn-differ.js` — авто-вызов `main()`) в харнесс добавлять нельзя.
- `test/fixtures/` — пары BPMN/DMN XML (golden-тесты компараторов: `base.bpmn` + варианты) и `dmn-table.html` (разметка таблицы dmn-js для `DmnDiffPainter`). Новый случай сравнения = новая фикстура-вариант + короткий тест.
- Объекты из vm-контекста имеют прототипы своего realm'а: перед `assert.deepEqual` оборачивай массивы в `Array.from`, Map — в `mapToObject` из scope.js.
- Тесты фиксируют **текущее** поведение, включая причуды (например, дублирование property group при изменении атрибута — см. комментарий в `bpmn-xml-comparator.test.js`). Менять ожидания можно только вместе с осознанным изменением поведения.

Покрыто: `ConditionFormatter`, `FileTypeDetector`, `DifferParams`, `BpmnXmlComparator`, `DmnXmlComparator`, `DmnDiffPainter`, чистые функции `utils.js`.

### Ручная проверка

Интеграционных автотестов нет. Проверка — ручная: загрузить распакованное расширение через `chrome://extensions` (Developer mode → Load unpacked) и проверить на странице GitLab MR / файла. Перед коммитом мысленно проверить, что порядок скриптов и поведение не сломаны.

- Быстрая проверка синтаксиса: `for f in *.js; do node --check "$f"; done`
- После изменений в общих классах differ-страницы (`differ-params.js`, `diagram-versions.js`, `branch-indicator.js`, `diff-type.js`, `utils.js`) **обязательно проверить и BPMN-, и DMN-diff**
- Чеклист differ-страницы: подсветка diff'ов, switch branch, highlight on/off, таблица изменений + клик по строке, условия sequenceFlow в панели свойств, zoom/pan/fit, hide properties, download, dive-in в Call Activity, branch-only режим (без MR)

## Допущения по умолчанию

- Поведение read-only (расширение ничего не пишет в GitLab)
- Производительности достаточно для диаграмм размера MR
- Простота > абстракции
