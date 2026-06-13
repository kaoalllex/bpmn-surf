# Архитектура

Chrome Extension (Manifest V3) для визуального сравнения BPMN 2.0 и DMN диаграмм в GitLab merge requests и репозиториях.

## Что делает проект

- Детектирует BPMN/DMN файлы на страницах GitLab (MR и просмотр файла в репозитории)
- Загружает две версии диаграммы (ветка MR vs. target branch) через GitLab API
- Рендерит их с подсветкой семантических отличий (🟢 добавлено, 🔴 удалено)
- Поддерживает сравнение с локальным файлом, zoom/pan, "Fit view", панель свойств, скачивание версии

## Структура

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
| `handler-locator.js` | `ExternalTaskHandlerLocator` — связь external-таски с кодом хендлера по топику: `findChangedTopics` (скан изменённых `.kt` из MR changes API) и `resolveLocation` (GitLab blob-search → файл:строка). Точки расширения: языки (`.java`), делегаты (ключ — имя класса), глубокий анализ зависимостей |
| `handler-navigator.js` | `HandlerNavigator` — overlay-плашка «‹/›» на service task: постоянная (цвет «изменён») для тасок с изменённым/добавленным в MR обработчиком, по клику для остальных. Клик: для изменённого обработчика — открыть его diff в этом MR; для остального — код на текущей показанной версии. «Обработчик» = external task handler (сделано) или delegate (на будущее) |
| `dmn-differ.js` | `DmnDiffer` — оркестратор DMN-diff'а + bootstrap (message listener) |
| `dmn-differ-view.js` | `DmnDifferView` — DOM страницы DMN-differ'а (layout, header, кнопки) |
| `dmn-table-viewport.js` | `DmnTableViewport` — zoom/fit/scroll таблицы решений dmn-js |
| `dmn-xml-comparator.js` | `DmnXmlComparator` — семантическое сравнение двух DMN XML → diff-модель |
| `dmn-diff-painter.js` | `DmnDiffPainter` — покраска diff-модели на DOM таблицы решений |
| `gitlab-repo-provider.js` | GitLab API, резолв коммитов/веток; `findSelectedFilePath` поддерживает обе разметки MR-диффов: legacy (`[data-path]` + `.is-active`/`.diff-file-is-active`, self-managed) и rapid diffs (`<diff-file data-file-data>`, gitlab.com — выбор по hash в URL, иначе единственный bpmn/dmn-файл) |
| `gitlab-ui-repo-provider.js` | Инъекция кнопок, выбор файлов; контейнер кнопки diff ищется по списку селекторов-кандидатов (self-managed без обёртки и gitlab.com c `.merge-request-sticky-header-wrapper`) |
| `repo-provider.js` / `ui-repo-provider.js` | Базовые интерфейсы провайдеров |
| `models.js` | DTO: `FileType`, `ProjectInfo`, `MergeRequestInfo` |
| `utils.js` | DOM, HTTP, парсинг XML, загрузка скриптов |
| `config.js` | Константы (например, `MASTER_BRANCH_NAME`) |
| `file-type-detector.js` | Определение типа файла по расширению |
| `camunda-bpmn-moddle-manager.js` | Загрузка/кэш Camunda moddle |
| `master-commit-manager.js` | История коммитов master с кэшем в localStorage |
| `page-reloader.js` | Защита от перезагрузок (макс. 3 попытки) |
| `manifest.json` | Манифест MV3; порядок content_scripts критичен |
| `libs/` | Vendored dist-файлы внешних библиотек; генерируются `npm run sync:libs`, вручную не править (см. docs/conventions.md) |
| `scripts/sync-libs.js` | Копирует файлы библиотек из `node_modules` в `libs/` по версиям из `package.json` |
| `test/` | Юнит-тесты (`node:test` + jsdom): vm-харнесс `test/support/scope.js`, фикстуры `test/fixtures/` — см. docs/testing.md |
